import {bulgeArc,splineThrough} from './curves';
import {
 DEG,add,angleOf,arcPoint,breakEnt,circleCircle,compose,cross,curveLength,curveRange,dist,dot,len,mul,norm360,onArc,paramAt,pieces,
 pointAt,propsOf,rotation,scaling,segCircle,sub,sweep,tangentAt,transformEnt,translation,
 type Affine,type Box,type Ent,type NewEnt,type PolyEnt,type Pt,
} from './model';
import {arcThrough} from './drawCommands';
import {angleText,editable,ghosts,isKey,lockedPick,num,strip,type Command,type Env} from './cmdkit';

const unit=(v:Pt):Pt=>{const l=len(v)||1;return [v[0]/l,v[1]/l];};
const inBox=(p:Pt,b:Box)=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
const extentOf=(list:Ent[]):Box=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const e of list)for(const pc of pieces(e)){const pts=pc.k==='seg'?[pc.a,pc.b]:[add(pc.c,[-pc.r,-pc.r]),add(pc.c,[pc.r,pc.r])];for(const [x,y] of pts){a=Math.min(a,x);b=Math.min(b,y);c=Math.max(c,x);d=Math.max(d,y);}}
 for(const e of list)if(e.type==='text'){a=Math.min(a,e.at[0]);b=Math.min(b,e.at[1]);c=Math.max(c,e.at[0]+e.height);d=Math.max(d,e.at[1]+e.height);}
 return a<Infinity?[a,b,c,d]:[0,0,1,1];};

// ---- FILLET and CHAMFER ---------------------------------------------------------------------------------------------
/** A picked line, circle or arc as the infinite line or the full circle it lies on. */
type Carrier={kind:'line';a:Pt;d:Pt}|{kind:'circle';c:Pt;r:number};
function carrier(e:Ent):Carrier|undefined{
 if(e.type==='line'&&dist(e.a,e.b)>1e-12)return {kind:'line',a:e.a,d:unit(sub(e.b,e.a))};
 if(e.type==='xline'||e.type==='ray')return {kind:'line',a:e.base,d:e.dir};
 if(e.type==='circle'||e.type==='arc')return {kind:'circle',c:e.center,r:e.radius};
 return undefined;
}
const foot=(k:Carrier,x:Pt):Pt=>k.kind==='line'?add(k.a,mul(k.d,dot(sub(x,k.a),k.d))):add(k.c,mul(unit(sub(x,k.c)),k.r));
function meet(k:Carrier,l:Carrier):Pt[]{
 if(k.kind==='line'&&l.kind==='line'){const den=cross(k.d,l.d);if(Math.abs(den)<1e-12)return [];const t=cross(sub(l.a,k.a),l.d)/den;return [add(k.a,mul(k.d,t))];}
 if(k.kind==='circle'&&l.kind==='circle')return circleCircle(k.c,k.r,l.c,l.r);
 const ln=(k.kind==='line'?k:l) as Extract<Carrier,{kind:'line'}>,ci=(k.kind==='circle'?k:l) as Extract<Carrier,{kind:'circle'}>;
 return segCircle(ln.a,add(ln.a,ln.d),ci.c,ci.r,true).map(t=>add(ln.a,mul(ln.d,t)));
}
const offsets=(k:Carrier,r:number):Carrier[]=>k.kind==='line'?[{...k,a:add(k.a,mul([-k.d[1],k.d[0]],r))},{...k,a:add(k.a,mul([k.d[1],-k.d[0]],r))}]:[{...k,r:k.r+r},...(k.r-r>1e-12?[{...k,r:k.r-r}]:[])];
/** The entity cut back (or extended) to t, keeping the side where it was picked. Circles are left whole. */
function keepTo(e:Ent,t:Pt,pick:Pt):Ent|undefined{
 if(e.type==='line'){const v=sub(e.b,e.a),l2=dot(v,v),tt=dot(sub(t,e.a),v)/l2,tp=dot(sub(pick,e.a),v)/l2;return tp<tt?{...e,b:t}:{...e,a:t};}
 if(e.type==='arc'){
  const at=norm360(angleOf(e.center,t)),ap=angleOf(e.center,pick),c1={start:e.start,end:at},c2={start:at,end:e.end};
  const ok=[c1,c2].filter(c=>sweep(c.start,c.end)>1e-9&&sweep(c.start,c.end)<360-1e-9&&onArc(ap,c.start,c.end));
  const best=ok.sort((x,y)=>sweep(x.start,x.end)-sweep(y.start,y.end))[0];return best?{...e,...best}:e;
 }
 if(e.type==='circle')return e;
 return undefined;
}
export interface FilletResult{put:Ent[];add:NewEnt[]}
/** Fillet two lines, arcs or circles with radius r (0 makes a corner), keeping the picked sides. */
export function fillet(e1:Ent,p1:Pt,e2:Ent,p2:Pt,r:number,trim=true):FilletResult|undefined{
 const k1=carrier(e1),k2=carrier(e2);if(!k1||!k2)return undefined;
 let best:{x:Pt;t1:Pt;t2:Pt;score:number}|undefined;
 if(r<=1e-12){for(const x of meet(k1,k2)){const score=dist(x,p1)+dist(x,p2);if(!best||score<best.score)best={x,t1:x,t2:x,score};}}
 else for(const o1 of offsets(k1,r))for(const o2 of offsets(k2,r))for(const x of meet(o1,o2)){const t1=foot(k1,x),t2=foot(k2,x),score=dist(t1,p1)+dist(t2,p2);if(!best||score<best.score)best={x,t1,t2,score};}
 if(!best)return undefined;
 const put:Ent[]=[];
 if(trim){const a=keepTo(e1,best.t1,p1),b=keepTo(e2,best.t2,p2);if(a&&a!==e1)put.push(a);if(b&&b!==e2)put.push(b);}
 const addl:NewEnt[]=[];
 if(r>1e-12){const a1=angleOf(best.x,best.t1),a2=angleOf(best.x,best.t2),ccw=sweep(a1,a2)<=180;addl.push({...propsOf(e1),type:'arc',center:best.x,radius:r,start:norm360(ccw?a1:a2),end:norm360(ccw?a2:a1)});}
 return {put,add:addl};
}
/** Chamfer two lines: d1 along the first and d2 along the second from their intersection. */
export function chamfer(e1:Ent,p1:Pt,e2:Ent,p2:Pt,d1:number,d2:number,trim=true):FilletResult|undefined{
 const k1=carrier(e1),k2=carrier(e2);if(k1?.kind!=='line'||k2?.kind!=='line'||e1.type!=='line'||e2.type!=='line')return undefined;
 const [x]=meet(k1,k2);if(!x)return undefined;
 const u1=dot(sub(p1,x),k1.d)>=0?k1.d:mul(k1.d,-1),u2=dot(sub(p2,x),k2.d)>=0?k2.d:mul(k2.d,-1),c1=add(x,mul(u1,d1)),c2=add(x,mul(u2,d2));
 const put:Ent[]=[];if(trim){put.push(keepTo(e1,c1,p1)!,keepTo(e2,c2,p2)!);}
 return {put,add:d1>1e-12||d2>1e-12?[{...propsOf(e1),type:'line',a:c1,b:c2}]:[]};
}
/** Fillet (radius) or chamfer (distances) every corner of a polyline between two straight segments. */
export function cornerPoly(e:PolyEnt,how:{radius:number}|{d1:number;d2:number}):PolyEnt{
 const n=e.points.length,closed=e.closed&&n>2,pts:Pt[]=[],bul:number[]=[],b=(i:number)=>e.bulges?.[i]??0;
 const segLen=(i:number)=>dist(e.points[i],e.points[(i+1)%n]);
 for(let i=0;i<n;i++){
  const v=e.points[i],hasIn=closed||i>0,hasOut=closed||i<n-1,pi=(i-1+n)%n;
  if(!hasIn||!hasOut||b(pi)||b(i)){pts.push(v);bul.push(b(i));continue;}
  const uin=unit(sub(v,e.points[pi])),uout=unit(sub(e.points[(i+1)%n],v)),turn=Math.atan2(cross(uin,uout),dot(uin,uout));
  if(Math.abs(turn)<1e-9){pts.push(v);bul.push(b(i));continue;}
  let kin:number,kout:number,bulge=0;
  if('radius' in how){kin=kout=how.radius*Math.tan(Math.abs(turn)/2);bulge=Math.tan(turn/4);}else{kin=how.d1;kout=how.d2;}
  if(kin<=1e-12||kin>segLen(pi)/2+1e-12||kout>segLen(i)/2+1e-12){pts.push(v);bul.push(b(i));continue;}
  pts.push(sub(v,mul(uin,kin)),add(v,mul(uout,kout)));bul.push(bulge,b(i));
 }
 return {...e,points:pts,bulges:bul.some(x=>x)?bul:undefined};
}
/** The index of the polyline segment under p. */
const segAt=(e:PolyEnt,p:Pt)=>Math.min(e.points.length-1,Math.floor(paramAt(e,p)+1e-9));
function cornerCmd(env:Env,isFillet:boolean):Command{
 const name=isFillet?'FILLET':'CHAMFER';
 type Step='first'|'second'|'radius'|'trim'|'poly'|'d1'|'d2'|'len'|'ang';
 let step:Step='first',first:{e:Ent;p:Pt}|undefined,multiple=false;
 const v=env.vars,unitDefault=env.store.doc.unit==='in'?.25:env.store.doc.unit==='mm'?6:10;
 const radius=()=>+(v.FILLETRAD??0),trim=()=>v.TRIMMODE!==false,d1=()=>+(v.CHAMFERA??unitDefault),d2=()=>+(v.CHAMFERB??unitDefault);
 const settings=()=>isFillet?`radius ${env.length(radius())}`:v.CHAMMODE==='A'?`length ${env.length(+(v.CHAMFERC??unitDefault))}, angle ${+(v.CHAMFERD??45)}°`:`distances ${env.length(d1())}, ${env.length(d2())}`;
 const dists=(e1:Ent,e2:Ent,p1:Pt,p2:Pt):[number,number]=>{
  if(v.CHAMMODE!=='A')return [d1(),d2()];
  const L=+(v.CHAMFERC??unitDefault),a=+(v.CHAMFERD??45)*DEG,k1=carrier(e1),k2=carrier(e2);
  if(k1?.kind!=='line'||k2?.kind!=='line')return [L,L];
  const [x]=meet(k1,k2);if(!x)return [L,L];
  const u1=dot(sub(p1,x),k1.d)>=0?k1.d:mul(k1.d,-1),u2=dot(sub(p2,x),k2.d)>=0?k2.d:mul(k2.d,-1),th=Math.acos(Math.max(-1,Math.min(1,dot(u1,u2))));
  return [L,L*Math.sin(a)/Math.sin(Math.PI-th-a)];
 };
 const finish=()=>{if(multiple){first=undefined;step='first';}else cmd.done=true;};
 const cmd:Command={name,done:false,
  prompt:()=>({first:`${name} Select first object or [Undo/Polyline/${isFillet?'Radius':'Distance/Angle'}/Trim/Multiple] (${settings()}${trim()?'':', no trim'}):`,second:`${name} Select second object:`,
   radius:`${name} Specify fillet radius <${env.length(radius())}>:`,trim:`${name} Enter Trim mode option [Trim/No trim] <${trim()?'Trim':'No trim'}>:`,poly:`${name} Select 2D polyline:`,
   d1:`${name} Specify first chamfer distance <${env.length(d1())}>:`,d2:`${name} Specify second chamfer distance <${env.length(d2())}>:`,len:`${name} Specify chamfer length on the first line:`,ang:`${name} Specify chamfer angle from the first line <45>:`} as Record<Step,string>)[step],
  wantsPick:()=>step==='first'||step==='second'||step==='poly',
  pick(e,p){
   if(!e||lockedPick(env,e))return;
   if(step==='poly'){if(e.type!=='poly'){env.log('That is not a polyline.');return;}const r=cornerPoly(e,isFillet?{radius:radius()}:{d1:d1(),d2:d2()});env.store.commit(name==='FILLET'?'Fillet':'Chamfer',{put:[r]});env.log(`${Math.round((r.points.length-e.points.length))} corners ${isFillet?'filleted':'chamfered'}.`);finish();return;}
   if(step==='first'){first={e,p};step='second';return;}
   const a=first!;
   // Two segments of one polyline: the corner between them.
   if(a.e.id===e.id&&e.type==='poly'){
    const i=segAt(e,a.p),j=segAt(e,p),n=e.points.length,lo=Math.min(i,j),hi=Math.max(i,j),vtx=hi-lo===1?hi:e.closed&&lo===0&&hi===n-1?0:-1;
    if(vtx<0){env.log('Pick two adjacent segments.');step='first';first=undefined;return;}
    const one:PolyEnt={...e,points:e.points,closed:e.closed};const r=cornerOne(one,vtx,isFillet?{radius:radius()}:{d1:d1(),d2:d2()});
    if(r){env.store.commit(isFillet?'Fillet':'Chamfer',{put:[r]});}else env.log('The segments are too short.');finish();return;
   }
   const res=isFillet?fillet(a.e,a.p,e,p,radius(),trim()):(()=>{const [x,y]=dists(a.e,e,a.p,p);return chamfer(a.e,a.p,e,p,x,y,trim());})();
   if(!res){env.log(isFillet?'Fillet lines, arcs and circles that meet (or polyline segments).':'Chamfer two lines that are not parallel.');step='first';first=undefined;return;}
   env.store.commit(isFillet?'Fillet':'Chamfer',{put:res.put,add:res.add});finish();
  },
  text(t){
   if(step==='first'){
    if(isKey(t,'Radius')&&isFillet){step='radius';return true;}
    if(isKey(t,'Distance')&&!isFillet){step='d1';return true;}
    if(isKey(t,'Angle')&&!isFillet){step='len';return true;}
    if(isKey(t,'Trim')){step='trim';return true;}
    if(isKey(t,'Polyline')){step='poly';return true;}
    if(isKey(t,'Multiple')){multiple=true;return true;}
    if(isKey(t,'Undo')){env.store.undo();return true;}
   }
   if(step==='radius'){const x=num(t);if(x===undefined||x<0)return false;v.FILLETRAD=x;step='first';return true;}
   if(step==='trim'){if(isKey(t,'Trim')){v.TRIMMODE=true;step='first';return true;}if(isKey(t,'No trim')||isKey(t,'N')){v.TRIMMODE=false;step='first';return true;}return false;}
   if(step==='d1'){const x=num(t);if(x===undefined||x<0)return false;v.CHAMFERA=x;v.CHAMFERB=x;v.CHAMMODE='D';step='d2';return true;}
   if(step==='d2'){const x=num(t);if(x===undefined||x<0)return false;v.CHAMFERB=x;step='first';return true;}
   if(step==='len'){const x=num(t);if(x===undefined||x<0)return false;v.CHAMFERC=x;v.CHAMMODE='A';step='ang';return true;}
   if(step==='ang'){const x=angleText(t);if(x===undefined||x<=0||x>=180)return false;v.CHAMFERD=x;step='first';return true;}
   return false;
  },
  enter(){if(step==='radius'||step==='trim'||step==='d2'||step==='ang'){step='first';return;}if(step==='d1'){step='d2';return;}cmd.done=true;}};
 return cmd;
}
/** One polyline corner filleted or chamfered (vertex index). */
function cornerOne(e:PolyEnt,vtx:number,how:{radius:number}|{d1:number;d2:number}):PolyEnt|undefined{
 // Rebuild from the original, splicing in the corner's two points.
 const n=e.points.length,v=e.points[vtx],pi=(vtx-1+n)%n,b=(i:number)=>e.bulges?.[i]??0;
 if(b(pi)||b(vtx))return undefined;
 const uin=unit(sub(v,e.points[pi])),uout=unit(sub(e.points[(vtx+1)%n],v)),turn=Math.atan2(cross(uin,uout),dot(uin,uout));
 const kin='radius' in how?how.radius*Math.tan(Math.abs(turn)/2):how.d1,kout='radius' in how?kin:how.d2;
 if(kin<=1e-12||kin>dist(v,e.points[pi])+1e-12||kout>dist(v,e.points[(vtx+1)%n])+1e-12)return undefined;
 const pts=[...e.points.slice(0,vtx),sub(v,mul(uin,kin)),add(v,mul(uout,kout)),...e.points.slice(vtx+1)];
 const bul=[...Array.from({length:vtx},(_,i)=>b(i)),'radius' in how?Math.tan(turn/4):0,b(vtx),...Array.from({length:n-vtx-1},(_,i)=>b(vtx+1+i))];
 return {...e,points:pts,bulges:bul.some(x=>x)?bul:undefined};
}

// ---- STRETCH -------------------------------------------------------------------------------------------------------
/** The entity with the parts inside box moved by d: endpoints and vertices inside move; objects wholly inside move whole. */
export function stretchEnt(e:Ent,box:Box,d:Pt):Ent{
 const mv=(p:Pt):Pt=>inBox(p,box)?add(p,d):p,whole=()=>transformEnt(e,translation(d));
 switch(e.type){
  case 'line':return {...e,a:mv(e.a),b:mv(e.b)};
  case 'poly':case 'solid':return {...e,points:e.points.map(mv)};
  case 'circle':case 'ellipse':return inBox(e.center,box)?whole():e;
  case 'xline':case 'ray':return inBox(e.base,box)?whole():e;
  case 'text':return inBox(e.at,box)?whole():e;
  case 'arc':{
   const s=arcPoint(e,e.start),t=arcPoint(e,e.end),m=arcPoint(e,e.start+sweep(e.start,e.end)/2),is=inBox(s,box),it=inBox(t,box);
   if(is&&it||inBox(e.center,box)&&(is||it))return whole();
   if(!is&&!it)return e;
   const g=arcThrough(is?add(s,d):s,m,it?add(t,d):t);return g?{...e,...g}:e;
  }
  case 'spline':{
   if(e.fit){const fit=e.fit.map(mv),g=splineThrough(fit,e.closed);return g?{...e,...g,fit}:e;}
   return {...e,ctrl:e.ctrl.map(mv)};
  }
  case 'dim':return {...e,a:mv(e.a),b:mv(e.b),at:mv(e.at)};
  case 'hatch':return {...e,loops:e.loops.map(l=>l.map(mv))};
 }
}
function stretchCmd(env:Env):Command{
 let list:Ent[]=[],win:Box|undefined,base:Pt|undefined;
 const result=(d:Pt)=>list.map(e=>win?stretchEnt(e,win,d):transformEnt(e,translation(d)));
 const cmd:Command={name:'STRETCH',done:false,selectFirst:true,
  begin(){list=editable(env);const w=env.lastWindow();win=w?.crossing?w.box:undefined;if(!list.length)cmd.done=true;else if(!win)env.log('No crossing window: the selected objects move whole. Select with a crossing window (drag right to left) to stretch.');},
  prompt:()=>!base?'STRETCH Specify base point:':'STRETCH Specify second point:',base:()=>base,
  point(p){if(!base){base=p;return;}env.store.commit('Stretch',{put:result(sub(p,base))});cmd.done=true;},
  preview:q=>base&&list.length<=1500?{ents:result(sub(q,base)).map(strip),rubber:[base,q]}:undefined};
 return cmd;
}

// ---- ARRAY ---------------------------------------------------------------------------------------------------------
/** Copies of the list for each transform (the first, the identity, is the original and is skipped). */
const copies=(list:Ent[],maps:Affine[])=>maps.slice(1).flatMap(m=>list.map(e=>strip(transformEnt(e,m))));
export function rectMaps(cols:number,rows:number,dx:number,dy:number):Affine[]{const out:Affine[]=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)out.push(translation([c*dx,r*dy]));return out;}
export function polarMaps(center:Pt,n:number,fill:number,rotate:boolean,base:Pt):Affine[]{
 const step=Math.abs(Math.abs(fill)-360)<1e-9?fill/n:fill/Math.max(1,n-1),out:Affine[]=[];
 for(let i=0;i<n;i++){const a=step*i;if(rotate)out.push(rotation(center,a));else{const r=rotation(center,a),p=[r[0]*base[0]+r[2]*base[1]+r[4],r[1]*base[0]+r[3]*base[1]+r[5]] as Pt;out.push(translation(sub(p,base)));}}
 return out;
}
/** A curve sampled by length: the point and tangent at any distance from its start. */
export function pathSampler(e:Ent){
 const r=curveRange(e);if(!r)return undefined;
 const n=e.type==='line'?1:e.type==='poly'?Math.ceil(r.t1-r.t0)*32:256,ts:number[]=[],cum:number[]=[0];let prev=pointAt(e,r.t0);ts.push(r.t0);
 for(let i=1;i<=n;i++){const t=r.t0+(r.t1-r.t0)*i/n,p=pointAt(e,t);cum.push(cum[i-1]+dist(prev,p));ts.push(t);prev=p;}
 const length=cum[n];
 const at=(s:number)=>{const x=Math.max(0,Math.min(length,s));let lo=0,hi=n;while(hi-lo>1){const m=(lo+hi)>>1;if(cum[m]<=x)lo=m;else hi=m;}const f=cum[hi]-cum[lo]>1e-15?(x-cum[lo])/(cum[hi]-cum[lo]):0,t=ts[lo]+(ts[hi]-ts[lo])*f;return {p:pointAt(e,t),tan:tangentAt(e,t)};};
 return {length,at};
}
export function pathMaps(path:Ent,n:number,align:boolean,spacing?:number):Affine[]{
 const s=pathSampler(path);if(!s)return [];
 const step=spacing??(n>1?s.length/(n-1):0),p0=s.at(0),out:Affine[]=[];
 for(let i=0;i<n;i++){const q=s.at(step*i),m=translation(sub(q.p,p0.p));out.push(align?compose(rotation(q.p,angleOf([0,0],q.tan)-angleOf([0,0],p0.tan)),m):m);}
 return out;
}
function arrayRectCmd(env:Env):Command{
 let list:Ent[]=[],step:'cols'|'rows'|'dx'|'dy'='cols',cols=4,rows=3,dx=1,dy=1,base:Pt=[0,0];
 const cmd:Command={name:'ARRAYRECT',done:false,selectFirst:true,
  begin(){list=editable(env);if(!list.length){cmd.done=true;return;}const b=extentOf(list);base=[b[0],b[1]];dx=(b[2]-b[0])*1.5||1;dy=(b[3]-b[1])*1.5||1;},
  prompt:()=>({cols:`ARRAYRECT Enter the number of columns <${cols}>:`,rows:`ARRAYRECT Enter the number of rows <${rows}>:`,dx:`ARRAYRECT Specify the distance between columns <${env.length(dx)}>:`,dy:`ARRAYRECT Specify the distance between rows <${env.length(dy)}>:`})[step],
  base:()=>step==='dx'||step==='dy'?base:undefined,
  point(p){if(step==='dx'){dx=p[0]-base[0]||dx;step='dy';}else if(step==='dy'){dy=p[1]-base[1]||dy;make();}},
  text(t){
   if(step==='cols'||step==='rows'){const v=Number(t);if(!Number.isInteger(v)||v<1||v>10000)return false;if(step==='cols'){cols=v;step='rows';}else{rows=v;step='dx';}return true;}
   const v=num(t);if(v===undefined||v===0)return false;if(step==='dx'){dx=v;step='dy';}else{dy=v;make();}return true;
  },
  enter(){if(step==='cols')step='rows';else if(step==='rows')step='dx';else if(step==='dx')step='dy';else make();},
  preview:q=>{const ddx=step==='dx'?q[0]-base[0]||dx:dx,ddy=step==='dy'?q[1]-base[1]||dy:dy;return list.length*cols*rows<=3000?{ents:copies(list,rectMaps(cols,rows,ddx,ddy))}:undefined;}};
 const make=()=>{if(cols*rows>1)env.store.commit('Rectangular array',{add:copies(list,rectMaps(cols,rows,dx,dy))});env.log(`${cols} columns × ${rows} rows.`);cmd.done=true;};
 return cmd;
}
function arrayPolarCmd(env:Env):Command{
 let list:Ent[]=[],step:'center'|'items'|'fill'|'rotate'='center',center:Pt|undefined,n=6,fill=360,base:Pt=[0,0];
 const maps=(rot:boolean)=>polarMaps(center!,n,fill,rot,base);
 const make=(rot:boolean)=>{if(n>1)env.store.commit('Polar array',{add:copies(list,maps(rot))});cmd.done=true;};
 const cmd:Command={name:'ARRAYPOLAR',done:false,selectFirst:true,
  begin(){list=editable(env);if(!list.length){cmd.done=true;return;}const b=extentOf(list);base=[(b[0]+b[2])/2,(b[1]+b[3])/2];},
  prompt:()=>({center:'ARRAYPOLAR Specify center point of array:',items:`ARRAYPOLAR Enter number of items <${n}>:`,fill:`ARRAYPOLAR Specify the angle to fill (+=ccw, -=cw) <${fill}>:`,rotate:'ARRAYPOLAR Rotate arrayed items? [Yes/No] <Yes>:'})[step],
  base:()=>center,
  point(p){if(step==='center'){center=p;step='items';}else if(step==='fill'){fill=norm360(angleOf(center!,p)-angleOf(center!,base))||360;step='rotate';}},
  text(t){
   if(step==='items'){const v=Number(t);if(!Number.isInteger(v)||v<1||v>10000)return false;n=v;step='fill';return true;}
   if(step==='fill'){const v=angleText(t);if(v===undefined||v===0||Math.abs(v)>360)return false;fill=v;step='rotate';return true;}
   if(step==='rotate'){if(isKey(t,'Yes')){make(true);return true;}if(isKey(t,'No')){make(false);return true;}}
   return false;
  },
  enter(){if(step==='items')step='fill';else if(step==='fill')step='rotate';else if(step==='rotate')make(true);},
  preview:()=>center&&step!=='center'&&list.length*n<=3000?{ents:copies(list,maps(true))}:undefined};
 return cmd;
}
function arrayPathCmd(env:Env):Command{
 let list:Ent[]=[],step:'path'|'items'|'align'='path',path:Ent|undefined,n=6;
 const make=(align:boolean)=>{if(n>1)env.store.commit('Path array',{add:copies(list,pathMaps(path!,n,align))});cmd.done=true;};
 const cmd:Command={name:'ARRAYPATH',done:false,selectFirst:true,
  begin(){list=editable(env);if(!list.length)cmd.done=true;},
  prompt:()=>({path:'ARRAYPATH Select path curve:',items:`ARRAYPATH Enter number of items along the path <${n}>:`,align:'ARRAYPATH Align items to the path? [Yes/No] <Yes>:'})[step],
  wantsPick:()=>step==='path',
  pick(e){if(!e)return;if(!curveRange(e)||e.type==='xline'||e.type==='ray'){env.log('Select a line, polyline, arc, circle, ellipse or spline.');return;}path=e;step='items';},
  text(t){
   if(step==='items'){const v=Number(t);if(!Number.isInteger(v)||v<1||v>10000)return false;n=v;step='align';return true;}
   if(step==='align'){if(isKey(t,'Yes')){make(true);return true;}if(isKey(t,'No')){make(false);return true;}}
   return false;
  },
  enter(){if(step==='items')step='align';else if(step==='align')make(true);else cmd.done=true;},
  preview:()=>path&&list.length*n<=3000?{ents:copies(list,pathMaps(path,n,true))}:undefined};
 return cmd;
}

// ---- BREAK ---------------------------------------------------------------------------------------------------------
function breakCmd(env:Env,atPoint:boolean):Command{
 const name=atPoint?'BREAKATPOINT':'BREAK';
 let target:Ent|undefined,first:Pt|undefined,step:'pick'|'second'|'first'|'point'='pick';
 const go=(a:Pt,b:Pt)=>{const e=target!,t0=paramAt(e,a),t1=paramAt(e,b),parts=breakEnt(e,t0,t1);if(!parts){env.log('That object does not break.');cmd.done=true;return;}env.store.commit('Break',{del:[e.id],add:parts});cmd.done=true;};
 const cmd:Command={name,done:false,
  prompt:()=>({pick:`${name} Select object:`,second:'BREAK Specify second break point or [First point]:',first:'BREAK Specify first break point:',point:'BREAKATPOINT Specify break point:'})[step],
  wantsPick:()=>step==='pick',
  base:()=>step==='second'?first:undefined,
  pick(e,p){if(!e||lockedPick(env,e))return;if(!curveRange(e)){env.log('Break lines, polylines, arcs, circles, ellipses, splines and construction lines.');return;}target=e;first=p;step=atPoint?'point':'second';},
  point(p){if(step==='second')go(first!,p);else if(step==='first'){first=p;step='second';}else if(step==='point')go(p,p);},
  text(t){if(step==='second'&&isKey(t,'First point')){step='first';return true;}if(step==='second'&&t.trim()==='@'){go(first!,first!);return true;}return false;}};
 return cmd;
}

// ---- JOIN ----------------------------------------------------------------------------------------------------------
interface Chain{points:Pt[];bulges:number[]}
const chainOf=(e:Ent):Chain|undefined=>{
 if(e.type==='line')return {points:[e.a,e.b],bulges:[0]};
 if(e.type==='arc'){const sw=sweep(e.start,e.end);return {points:[arcPoint(e,e.start),arcPoint(e,e.end)],bulges:[Math.tan(sw*DEG/4)]};}
 if(e.type==='poly'&&!e.closed){const n=e.points.length;return {points:[...e.points],bulges:Array.from({length:n-1},(_,i)=>e.bulges?.[i]??0)};}
 return undefined;
};
const reverseChain=(c:Chain):Chain=>({points:[...c.points].reverse(),bulges:[...c.bulges].reverse().map(b=>-b)});
/** Lines, arcs and open polylines joined: collinear lines into one line, arcs on one circle into one arc, the rest end to end into polylines. */
export function joinEnts(list:Ent[],tol=1e-6):{del:number[];add:NewEnt[]}|undefined{
 if(list.length<2)return undefined;
 const pr=propsOf(list[0]);
 if(list.every(e=>e.type==='line')){
  const ls=list as Extract<Ent,{type:'line'}>[],d=unit(sub(ls[0].b,ls[0].a)),o=ls[0].a;
  if(ls.every(l=>Math.abs(cross(sub(l.a,o),d))<tol&&Math.abs(cross(sub(l.b,o),d))<tol)){
   const iv=ls.map(l=>{const a=dot(sub(l.a,o),d),b=dot(sub(l.b,o),d);return [Math.min(a,b),Math.max(a,b)];}).sort((x,y)=>x[0]-y[0]);
   let hi=iv[0][1];for(const [a,b] of iv.slice(1)){if(a>hi+tol)return undefined;hi=Math.max(hi,b);}
   return {del:ls.map(l=>l.id),add:[{...pr,type:'line',a:add(o,mul(d,iv[0][0])),b:add(o,mul(d,hi))}]};
  }
 }
 if(list.every(e=>e.type==='arc')){
  const as=list as Extract<Ent,{type:'arc'}>[],c=as[0].center,r=as[0].radius;
  if(as.every(a=>dist(a.center,c)<tol&&Math.abs(a.radius-r)<tol)){
   // The union must be one stretch of the circle: try each arc as the start and sweep counterclockwise over the others.
   const iv=as.map(a=>({s:norm360(a.start),w:sweep(a.start,a.end)})),eps=tol/r/DEG;
   for(const first of iv){
    let end=first.w,ok=true;
    for(const o of [...iv].filter(x=>x!==first).sort((x,y)=>norm360(x.s-first.s)-norm360(y.s-first.s))){const at=norm360(o.s-first.s);if(at>end+eps){ok=false;break;}end=Math.max(end,at+o.w);}
    if(!ok)continue;
    if(end>=360-1e-7)return {del:as.map(a=>a.id),add:[{...pr,type:'circle',center:c,radius:r}]};
    return {del:as.map(a=>a.id),add:[{...pr,type:'arc',center:c,radius:r,start:first.s,end:norm360(first.s+end)}]};
   }
   return undefined;
  }
 }
 const items=list.map(e=>({e,c:chainOf(e)})).filter((x):x is {e:Ent;c:Chain}=>!!x.c);
 if(items.length<2)return undefined;
 const used=new Set<number>(),out:NewEnt[]=[],del:number[]=[];
 for(let i=0;i<items.length;i++){
  if(used.has(i))continue;used.add(i);let ch=items[i].c;const members=[items[i].e.id];
  for(let grew=true;grew;){
   grew=false;
   for(let j=0;j<items.length;j++){if(used.has(j))continue;const c=items[j].c,end=ch.points[ch.points.length-1],start=ch.points[0],cs=c.points[0],ce=c.points[c.points.length-1];
    let next:Chain|undefined,atEnd=true;
    if(dist(end,cs)<tol)next=c;else if(dist(end,ce)<tol)next=reverseChain(c);else if(dist(start,ce)<tol){next=c;atEnd=false;}else if(dist(start,cs)<tol){next=reverseChain(c);atEnd=false;}
    if(!next)continue;
    ch=atEnd?{points:[...ch.points,...next.points.slice(1)],bulges:[...ch.bulges,...next.bulges]}:{points:[...next.points,...ch.points.slice(1)],bulges:[...next.bulges,...ch.bulges]};
    used.add(j);members.push(items[j].e.id);grew=true;
   }
  }
  if(members.length<2)continue;
  const closed=ch.points.length>3&&dist(ch.points[0],ch.points[ch.points.length-1])<tol,pts=closed?ch.points.slice(0,-1):ch.points,bul=closed?ch.bulges:[...ch.bulges,0];
  out.push({...propsOf(items[i].e),type:'poly',points:pts,closed,...(bul.some(b=>b)?{bulges:bul}:{})});del.push(...members);
 }
 return out.length?{del,add:out}:undefined;
}
function joinCmd(env:Env):Command{
 const cmd:Command={name:'JOIN',done:false,selectFirst:true,prompt:()=>'JOIN',
  begin(){const list=editable(env),size=Math.max(1e-9,...list.map(e=>curveLength(e))),r=joinEnts(list,size*1e-7+1e-9);
   if(!r)env.log('Nothing to join: select lines, arcs or open polylines that meet end to end (or collinear lines, or arcs on one circle).');
   else{env.store.commit('Join',r);env.log(`${r.del.length} objects joined into ${r.add.length}.`);}cmd.done=true;}};
 return cmd;
}

// ---- LENGTHEN ------------------------------------------------------------------------------------------------------
/** The curve with the end nearer p moved so its length is total (lines, arcs, open polylines). */
export function lengthenEnt(e:Ent,p:Pt,total:number):Ent|undefined{
 if(total<=1e-12)return undefined;
 if(e.type==='line'){const atB=dist(p,e.b)<=dist(p,e.a),fix=atB?e.a:e.b,dir=unit(sub(atB?e.b:e.a,fix)),q=add(fix,mul(dir,total));return atB?{...e,b:q}:{...e,a:q};}
 if(e.type==='arc'){const sw=total/e.radius/DEG;if(sw>=360)return undefined;const atEnd=dist(p,arcPoint(e,e.end))<=dist(p,arcPoint(e,e.start));return atEnd?{...e,end:norm360(e.start+sw)}:{...e,start:norm360(e.end-sw)};}
 if(e.type==='poly'&&!e.closed&&e.points.length>1){
  const n=e.points.length,atEnd=dist(p,e.points[n-1])<=dist(p,e.points[0]),L=curveLength(e),i=atEnd?n-2:0,a=e.points[i],b=e.points[i+1],bg=e.bulges?.[i]??0;
  const segL=bg?(()=>{const k=bulgeArc(a,b,bg)!;return k.r*Math.abs(k.sweep)*DEG;})():dist(a,b),nl=segL+(total-L);if(nl<=1e-12)return undefined;
  const pts=[...e.points],bul=e.bulges?[...e.bulges]:undefined;
  if(!bg){if(atEnd)pts[n-1]=add(a,mul(unit(sub(b,a)),nl));else pts[0]=add(b,mul(unit(sub(a,b)),nl));}
  else{const k=bulgeArc(a,b,bg)!,sw=Math.sign(k.sweep)*nl/k.r/DEG;if(Math.abs(sw)>=360)return undefined;
   if(atEnd){pts[n-1]=add(k.c,mul([Math.cos((k.a0+sw)*DEG),Math.sin((k.a0+sw)*DEG)],k.r));}
   else{const a1=k.a0+k.sweep;pts[0]=add(k.c,mul([Math.cos((a1-sw)*DEG),Math.sin((a1-sw)*DEG)],k.r));}
   bul![i]=Math.tan(sw*DEG/4);}
  return {...e,points:pts,...(bul?{bulges:bul}:{})};
 }
 return undefined;
}
function lengthenCmd(env:Env):Command{
 type Mode='DE'|'P'|'T'|'DY';
 let mode=(env.vars.LENGTHENMODE as Mode)??'DE',step:'measure'|'value'|'change'|'dyn'='measure',value=+(env.vars.LENGTHENVALUE??(mode==='P'?100:1)),dynTarget:Ent|undefined,dynPick:Pt|undefined;
 const target=(e:Ent,L:number)=>mode==='DE'?L+value:mode==='P'?L*value/100:value;
 const label={DE:'delta length',P:'percent of the length',T:'total length',DY:'dynamic'};
 const cmd:Command={name:'LENGTHEN',done:false,
  prompt:()=>step==='measure'?`LENGTHEN Select an object to measure or [DElta/Percent/Total/DYnamic] <${mode==='DY'?'DYnamic':label[mode]}>:`:step==='value'?`LENGTHEN Enter ${label[mode]} <${mode==='P'?value:env.length(value)}>:`:step==='dyn'?'LENGTHEN Specify new end point:':'LENGTHEN Select an object to change or [Undo]:',
  wantsPick:()=>step==='measure'||step==='change',
  pick(e,p){
   if(!e)return;
   if(step==='measure'){const L=curveLength(e);env.log(`Current length: ${env.length(L)}${e.type==='arc'?`, included angle ${Number(sweep(e.start,e.end).toFixed(4))}°`:''}`);step='change';return;}
   if(lockedPick(env,e))return;
   if(mode==='DY'){dynTarget=e;dynPick=p;step='dyn';return;}
   const r=lengthenEnt(e,p,target(e,curveLength(e)));if(r)env.store.commit('Lengthen',{put:[r]});else env.log('Lengthen lines, arcs and open polylines (and not to nothing).');
  },
  point(p){
   if(step!=='dyn'||!dynTarget)return;const e=dynTarget,pk=dynPick!;let r:Ent|undefined;
   if(e.type==='line'){const atB=dist(pk,e.b)<=dist(pk,e.a),fix=atB?e.a:e.b,dir=unit(sub(atB?e.b:e.a,fix));r=lengthenEnt(e,pk,dot(sub(p,fix),dir));}
   else if(e.type==='arc'){const atEnd=dist(pk,arcPoint(e,e.end))<=dist(pk,arcPoint(e,e.start)),a=norm360(angleOf(e.center,p));r=atEnd?{...e,end:a}:{...e,start:a};}
   else if(e.type==='poly'&&!e.closed){const n=e.points.length,atEnd=dist(pk,e.points[n-1])<=dist(pk,e.points[0]),end=atEnd?e.points[n-1]:e.points[0],prev=atEnd?e.points[n-2]:e.points[1];r=lengthenEnt(e,pk,curveLength(e)+dot(sub(p,end),unit(sub(end,prev))));}
   if(r)env.store.commit('Lengthen',{put:[r]});else env.log('Lengthen lines, arcs and open polylines.');step='change';
  },
  text(t){
   if(step==='measure'||step==='change'){
    if(isKey(t,'DElta')){mode='DE';step='value';env.vars.LENGTHENMODE=mode;return true;}
    if(isKey(t,'Percent')){mode='P';value=100;step='value';env.vars.LENGTHENMODE=mode;return true;}
    if(isKey(t,'Total')){mode='T';step='value';env.vars.LENGTHENMODE=mode;return true;}
    if(isKey(t,'DYnamic')){mode='DY';step='change';env.vars.LENGTHENMODE=mode;return true;}
    if(step==='change'&&isKey(t,'Undo')){env.store.undo();return true;}
   }
   if(step==='value'){const v=num(t);if(v===undefined||(mode!=='DE'&&v<=0))return false;value=v;env.vars.LENGTHENVALUE=v;step='change';return true;}
   return false;
  },
  enter(){if(step==='value'){step='change';return;}cmd.done=true;}};
 return cmd;
}

// ---- ALIGN ---------------------------------------------------------------------------------------------------------
/** The map taking s1 to d1 and the direction s1→s2 onto d1→d2, scaled to match when scale. */
export function alignMap(s1:Pt,d1:Pt,s2?:Pt,d2?:Pt,scale=false):Affine{
 if(!s2||!d2||dist(s1,s2)<1e-12||dist(d1,d2)<1e-12)return translation(sub(d1,s1));
 const rot=angleOf(d1,d2)-angleOf(s1,s2),k=scale?dist(d1,d2)/dist(s1,s2):1;
 return compose(scaling(d1,k),compose(rotation(d1,rot),translation(sub(d1,s1))));
}
function alignCmd(env:Env):Command{
 let list:Ent[]=[];const pts:Pt[]=[];let asking=false;
 const go=(scale:boolean)=>{const m=alignMap(pts[0],pts[1],pts[2],pts[3],scale);env.store.commit('Align',{put:list.map(e=>transformEnt(e,m))});cmd.done=true;};
 const labels=['first source point','first destination point','second source point','second destination point'];
 const cmd:Command={name:'ALIGN',done:false,selectFirst:true,
  begin(){list=editable(env);if(!list.length)cmd.done=true;},
  prompt:()=>asking?'ALIGN Scale objects based on alignment points? [Yes/No] <N>:':`ALIGN Specify ${labels[pts.length]}${pts.length===2?' or <continue>':''}:`,
  base:()=>pts.length%2===1?pts[pts.length-1]:undefined,
  point(p){if(asking)return;pts.push(p);if(pts.length===4)asking=true;},
  text(t){if(!asking)return false;if(isKey(t,'Yes')){go(true);return true;}if(isKey(t,'No')){go(false);return true;}return false;},
  enter(){if(asking){go(false);return;}if(pts.length===2){go(false);return;}cmd.done=true;},
  preview:q=>pts.length===1?{ents:ghosts(list,alignMap(pts[0],q)),rubber:[pts[0],q]}:pts.length===3?{ents:ghosts(list,alignMap(pts[0],pts[1],pts[2],q)),rubber:[pts[2],q]}:undefined};
 return cmd;
}

// ---- PEDIT ---------------------------------------------------------------------------------------------------------
/** Biarc fit through the vertices: tangent-continuous arcs, a junction vertex added in each segment. */
export function fitPoly(e:PolyEnt):PolyEnt{
 const P=e.points,n=P.length,closed=e.closed&&n>2;if(n<3)return e;
 const tan=(i:number):Pt=>{const prev=closed?P[(i-1+n)%n]:P[Math.max(0,i-1)],next=closed?P[(i+1)%n]:P[Math.min(n-1,i+1)];return unit(sub(next,prev));};
 const pts:Pt[]=[],bul:number[]=[],segs=closed?n:n-1;
 for(let i=0;i<segs;i++){
  const a=P[i],b=P[(i+1)%n],t0=tan(i),t1=tan((i+1)%n),v=sub(b,a),tt=add(t0,t1),den=2*(1-dot(t0,t1));
  let d:number;if(Math.abs(den)<1e-9){const vt=dot(v,t1);d=Math.abs(vt)<1e-12?len(v)/2:dot(v,v)/(4*vt);}else{const vt=dot(v,tt);d=(-vt+Math.sqrt(vt*vt+den*dot(v,v)))/den;}
  const j=mul(add(add(a,mul(t0,d)),sub(b,mul(t1,d))),.5);
  pts.push(a,j);bul.push(tanBulge(a,t0,j),-tanBulge(b,mul(t1,-1),j));
 }
 if(!closed){pts.push(P[n-1]);bul.push(0);}
 return {...e,points:pts,bulges:bul};
}
/** The bulge of the arc leaving a along unit tangent t and ending at b. */
const tanBulge=(a:Pt,t:Pt,b:Pt)=>{const ch=sub(b,a),d=Math.atan2(cross(t,ch),dot(t,ch));return Math.tan(d/2);};
function peditCmd(env:Env):Command{
 type Step='pick'|'convert'|'option'|'join';
 let step:Step='pick',target:PolyEnt|undefined,source:Ent|undefined;const joinList:Ent[]=[];
 const put=(e:PolyEnt,label:string)=>{env.store.commit(label,{put:[e]});target=env.store.get(e.id) as PolyEnt;};
 const cmd:Command={name:'PEDIT',done:false,
  prompt:()=>step==='pick'?'PEDIT Select polyline:':step==='convert'?'PEDIT Object selected is not a polyline. Do you want to turn it into one? <Y>':step==='join'?'PEDIT Select objects to join (Enter when done):':
   `PEDIT Enter an option [${target!.closed?'Open':'Close'}/Join/Fit/Spline/Decurve/Reverse/eXit]:`,
  wantsPick:()=>step==='pick'||step==='join',
  pick(e){
   if(!e||lockedPick(env,e))return;
   if(step==='join'){if(e.id!==target!.id&&!joinList.some(x=>x.id===e.id))joinList.push(e);return;}
   if(e.type==='poly'){target=e;step='option';return;}
   if(e.type==='line'||e.type==='arc'){source=e;step='convert';return;}
   env.log('Select a polyline, line or arc.');
  },
  text(t){
   if(step==='convert'){if(isKey(t,'Yes')){convert();return true;}if(isKey(t,'No')){cmd.done=true;return true;}return false;}
   if(step!=='option')return false;
   const e=target!;
   if(isKey(t,'Close')&&!e.closed){put({...e,closed:true,...(e.bulges?{bulges:[...e.bulges.slice(0,e.points.length-1),0]}:{})},'Close polyline');return true;}
   if(isKey(t,'Open')&&e.closed){put({...e,closed:false},'Open polyline');return true;}
   if(isKey(t,'Join')){step='join';return true;}
   if(isKey(t,'Fit')){put(fitPoly(e),'Fit polyline');return true;}
   if(isKey(t,'Spline')){const g=splineThrough(e.closed?e.points:e.points,e.closed);if(g){env.store.commit('Spline from polyline',{del:[e.id],add:[{...propsOf(e),type:'spline',...g,fit:[...e.points],closed:e.closed}]});}cmd.done=true;return true;}
   if(isKey(t,'Decurve')){put({...e,bulges:undefined},'Decurve polyline');return true;}
   if(isKey(t,'Reverse')){const n=e.points.length,b=e.bulges;const segs=e.closed?n:n-1;
    const rb=b?(()=>{const out=new Array(n).fill(0);for(let i=0;i<segs;i++){const j=e.closed?(n-1-i-1+n)%n:n-2-i;out[j]=-(b[i]??0);}return out;})():undefined;
    const pts=[...e.points].reverse();put(e.closed?{...e,points:[pts[n-1],...pts.slice(0,n-1)],...(rb?{bulges:[rb[n-1],...rb.slice(0,n-1)]}:{})}:{...e,points:pts,...(rb?{bulges:rb}:{})},'Reverse polyline');return true;}
   if(isKey(t,'eXit')){cmd.done=true;return true;}
   return false;
  },
  enter(){
   if(step==='convert'){convert();return;}
   if(step==='join'){const r=joinEnts([target!,...joinList],1e-6);if(r&&r.add.length===1){env.store.commit('Join polyline',r);const id=env.store.doc.entities[env.store.doc.entities.length-1].id;target=env.store.get(id) as PolyEnt;env.log(`${joinList.length} segments added to the polyline.`);}else if(joinList.length)env.log('Those objects do not meet the polyline end to end.');joinList.length=0;step='option';return;}
   cmd.done=true;
  }};
 const convert=()=>{const e=source!,r=e.type==='line'?{points:[e.a,e.b],bulges:undefined}:e.type==='arc'?{points:[arcPoint(e,e.start),arcPoint(e,e.end)],bulges:[Math.tan(sweep(e.start,e.end)*DEG/4),0]}:undefined;
  if(!r){cmd.done=true;return;}const [id]=env.store.commit('Polyline from object',{del:[e.id],add:[{...propsOf(e),type:'poly',closed:false,...r} as NewEnt]});target=env.store.get(id) as PolyEnt;step='option';};
 return cmd;
}

// ---- MATCHPROP -----------------------------------------------------------------------------------------------------
/** The destination with the source's layer, color, linetype, lineweight and linetype scale (and text height and dimension size). */
export function matchProps(src:Ent,dst:Ent):Ent{
 const {color:_c,ltype:_l,weight:_w,ltscale:_s,...rest}=dst,out={...rest,...propsOf(src)} as Ent;
 if(src.type==='text'&&out.type==='text')return {...out,height:src.height,bold:src.bold};
 if(src.type==='dim'&&out.type==='dim')return {...out,height:src.height};
 return out;
}
function matchCmd(env:Env):Command{
 let src:Ent|undefined;
 const cmd:Command={name:'MATCHPROP',done:false,
  prompt:()=>src?'MATCHPROP Select destination object(s) (Enter when done):':'MATCHPROP Select source object:',
  wantsPick:()=>true,
  pick(e){if(!e)return;if(!src){src=e;env.log(`Matching layer ${e.layer}${e.color!==undefined?`, color ${e.color}`:''}${e.ltype?`, ${e.ltype}`:''}${e.weight!==undefined?`, ${(e.weight/100).toFixed(2)} mm`:''}.`);return;}if(e.id===src.id||lockedPick(env,e))return;env.store.commit('Match properties',{put:[matchProps(src,e)]});},
  enter(){cmd.done=true;}};
 return cmd;
}

export const modifyNames:Record<string,string>={
 F:'FILLET',FILLET:'FILLET',CHA:'CHAMFER',CHAMFER:'CHAMFER',S:'STRETCH',STRETCH:'STRETCH',AR:'ARRAYRECT',ARRAY:'ARRAYRECT',ARRAYRECT:'ARRAYRECT',ARRAYPOLAR:'ARRAYPOLAR',ARRAYPATH:'ARRAYPATH',
 BR:'BREAK',BREAK:'BREAK',BREAKATPOINT:'BREAKATPOINT',J:'JOIN',JOIN:'JOIN',LEN:'LENGTHEN',LENGTHEN:'LENGTHEN',AL:'ALIGN',ALIGN:'ALIGN',PE:'PEDIT',PEDIT:'PEDIT',MA:'MATCHPROP',MATCHPROP:'MATCHPROP',PAINTER:'MATCHPROP',
};
export const modifyCommands:Record<string,(env:Env)=>Command>={
 FILLET:env=>cornerCmd(env,true),CHAMFER:env=>cornerCmd(env,false),STRETCH:stretchCmd,ARRAYRECT:arrayRectCmd,ARRAYPOLAR:arrayPolarCmd,ARRAYPATH:arrayPathCmd,
 BREAK:env=>breakCmd(env,false),BREAKATPOINT:env=>breakCmd(env,true),JOIN:joinCmd,LENGTHEN:lengthenCmd,ALIGN:alignCmd,PEDIT:peditCmd,MATCHPROP:matchCmd,
};
