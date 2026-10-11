import {Cam,fit,hull,poly,proj,r2,type Projector,type Vec2,type Vec3} from './iso';

/**
 * Report figures in the Hairline manner: orthographic 2:1 isometric line drawings, plates filled with the paper
 * colour and painted back to front, hairline strokes that do not scale. Solids are convex extrusions along a world
 * axis (plates, flanges, webs, tapered ribs, bolts), so each is drawn as its front faces and its silhouette.
 * World axes: x along the runway, y across it (away from the column face), z up; millimetres.
 * The palette is Hairline's light theme in neutral grays, so the printed calculation stays black and white.
 */
export const tone={plate:'#ffffff',hi:'#000',edge:'#8f8f8f',mid:'#bdbdbd',lo:'#e4e4e4',focus:'#ececec',focusSide:'#dedede'};
export type Role='context'|'focus'|'existing'|'ghost';
type Axis=0|1|2;
interface Solid{faces:Vec3[][];min:Vec3;max:Vec3;role:Role;part?:string}
interface Arrow{from:Vec3;to:Vec3;label?:string;dashed?:boolean;part?:string}
/** A numbered marker on a tagged part (or, without one, at a point); `at` is a hint for where on the part. */
interface Marker{n:number;part?:string;at?:Vec3;dx:number;dy:number}
interface Label{text:string;at:Vec3;dx:number;dy:number;anchor:'start'|'middle'|'end';bold?:boolean}
/** Does a part key name this part? A key also names its sub-parts: 'bracket' covers 'bracket/seat'. */
export const partMatches=(key:string,part?:string)=>!!part&&(part===key||part.startsWith(key+'/'));
/** The drawing as laid out on the paper: what the markers point at and where everything sits, for checking. */
export interface FigureLayout{
 width:number;height:number;
 solids:{part?:string;hull:Vec2[];role:Role}[];
 paths:{part?:string;pts:Vec2[]}[];
 arrows:{part?:string;from:Vec2;to:Vec2}[];
 labels:{text:string;box:[number,number,number,number]}[];
 markers:{n:number;part?:string;anchor:Vec2;center:Vec2;radius:number;leader:boolean}[];
}
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** A convex polygon in the plane normal to `axis`, swept from a to b along it. Profile points are the other two axes in order (x,y,z minus axis). */
function extrude(axis:Axis,profile:Vec2[],a:number,b:number):Vec3[][]{
 const at=(q:Vec2,t:number):Vec3=>axis===0?[t,q[0],q[1]]:axis===1?[q[0],t,q[1]]:[q[0],q[1],t];
 const lo=profile.map(q=>at(q,a)),hiCap=profile.map(q=>at(q,b)),faces:Vec3[][]=[lo.slice().reverse(),hiCap];
 for(let i=0;i<profile.length;i++){const j=(i+1)%profile.length;faces.push([lo[i],lo[j],hiCap[j],hiCap[i]]);}
 return faces;
}
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
/** Ensures counter-clockwise profiles (outward normals for the faces built from them). */
const ccw=(p:Vec2[])=>{const s=p.reduce((a,q,i)=>{const r=p[(i+1)%p.length];return a+q[0]*r[1]-r[0]*q[1];},0);return s<0?p.slice().reverse():p;};

export class Scene{
 private solids:Solid[]=[];private shift:Vec3=[0,0,0];private current?:string;
 /** Tags the solids, lines and loads added from now on with a part key (undefined: untagged); returns the previous key. */
 tag(part?:string){const was=this.current;this.current=part;return was;}
 /** Adds the parts drawn by `draw` under the key, then restores the previous one. */
 group(part:string,draw:()=>void){const was=this.tag(part);draw();this.tag(was);return this;}
 /** Moves the solids added from now on by (dx, dy, dz): a part drawn at the origin, placed elsewhere. */
 at(dx=0,dy=0,dz=0){this.shift=[dx,dy,dz];return this;}
 private arrows:Arrow[]=[];private markers:Marker[]=[];private labels:Label[]=[];private paths:{pts:Vec3[];role:'path'|'center'|'line'|'rod'|'dim';part?:string}[]=[];
 /** An axis-aligned plate or block. */
 box(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,role:Role='context'){
  return this.prism(2,[[Math.min(x0,x1),Math.min(y0,y1)],[Math.max(x0,x1),Math.min(y0,y1)],[Math.max(x0,x1),Math.max(y0,y1)],[Math.min(x0,x1),Math.max(y0,y1)]],Math.min(z0,z1),Math.max(z0,z1),role);
 }
 /** A convex profile swept along a world axis (0 x, 1 y, 2 z) from a to b. */
 prism(axis:Axis,profile:Vec2[],a:number,b:number,role:Role='context'){
  // The y axis takes its profile in (x, z), a left-handed pair: reverse it so every face normal points outward.
  const prof=ccw(profile),[dx,dy,dz]=this.shift,faces=extrude(axis,axis===1?prof.slice().reverse():prof,Math.min(a,b),Math.max(a,b)).map(f=>f.map(q=>[q[0]+dx,q[1]+dy,q[2]+dz] as Vec3)),pts=faces.flat();
  this.solids.push({faces,role,part:this.current,min:[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))) as Vec3,max:[0,1,2].map(i=>Math.max(...pts.map(p=>p[i]))) as Vec3});return this;
 }
 /** A round bar (bolt, rod) as a 12-sided prism. */
 cylinder(axis:Axis,c:Vec2,r:number,a:number,b:number,role:Role='context'){
  return this.prism(axis,Array.from({length:12},(_,i)=>[c[0]+r*Math.cos(i*Math.PI/6),c[1]+r*Math.sin(i*Math.PI/6)] as Vec2),a,b,role);
 }
 /** A load: a heavy shaft and a solid head at `to`. */
 arrow(from:Vec3,to:Vec3,label?:string,dashed=false){this.arrows.push({from,to,label,dashed,part:this.current??(label?`load/${label}`:undefined)});return this;}
 /**
  * A numbered load-path marker on a part: its leader ends on the visible face of the solids (or the line or load)
  * tagged with that key, nearest the hint `at`; (dx, dy) is the preferred paper offset of the circle, moved where it
  * would cover another marker or label or cross a leader. Given a point instead of a key, it points there.
  */
 marker(n:number,target:Vec3|string,dx=0,dy=0,at?:Vec3){this.markers.push(typeof target==='string'?{n,part:target,at,dx,dy}:{n,at:target,dx,dy});return this;}
 label(text:string,at:Vec3,dx=0,dy=0,anchor:Label['anchor']='start',bold=false){this.labels.push({text,at,dx,dy,anchor,bold});return this;}
 /** The load path, dotted through the parts it crosses, drawn over the solids. */
 path(pts:Vec3[]){this.paths.push({pts,role:'path',part:this.current});return this;}
 centerline(a:Vec3,b:Vec3){this.paths.push({pts:[a,b],role:'center',part:this.current});return this;}
 /** A thin solid line: a deflected shape, a diagram or a leader. */
 line(pts:Vec3[]){this.paths.push({pts,role:'line',part:this.current});return this;}
 /** A rod or bar that is not along a world axis (a diagonal brace), drawn as a heavy line over the solids. */
 rod(a:Vec3,b:Vec3){this.paths.push({pts:[a,b],role:'rod',part:this.current});return this;}
 /** A dimension: thin line with ticks at both ends and its text at the middle. */
 dim(a:Vec3,b:Vec3,text:string,dx=0,dy=-4){this.paths.push({pts:[a,b],role:'dim'});return this.label(text,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],dx,dy,'middle');}

 /** Camera, projector and paint order for a W × H view box: the drawing fills the box with a margin for markers and labels. */
 private view(o:RenderOptions){
  const W=o.width??400,H=o.height??300,C=Cam(o.az??38,o.k??.5,1),[mx,my]=o.margin??[56,44];
  const pts=[...this.solids.flatMap(s=>s.faces.flat()),...this.arrows.flatMap(a=>[a.from,a.to]),...this.paths.flatMap(p=>p.pts),...this.labels.map(l=>l.at),...(o.extra??[])];
  const P0=proj(C);let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const p of pts){const q=P0(...p);x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1]);}
  C.S=Math.min((W-mx)/Math.max(x1-x0,1e-6),(H-my)/Math.max(y1-y0,1e-6));fit(C,pts,W/2,H/2);
  const P=proj(C),zf=Math.sqrt(1-C.k*C.k),V:Vec3=[Math.sin(C.az),Math.cos(C.az),C.k/zf];
  return {W,H,P,V,order:sortSolids(this.solids,V)};
 }
 /** Where everything sits on the paper, the markers placed: the leaders end on their parts, circles and leaders kept clear. */
 layout(o:RenderOptions):FigureLayout{
  const {W,H,P,order}=this.view(o);
  const solids=order.map(s=>({part:s.part,hull:hull(s.faces.flat().map(p=>P(...p))),role:s.role}));
  const paths=this.paths.filter(p=>p.role!=='dim').map(p=>({part:p.part,pts:p.pts.map(q=>P(...q))}));
  const arrows=this.arrows.map(a=>({part:a.part,from:P(...a.from),to:P(...a.to)}));
  const labels:FigureLayout['labels']=[];
  for(const a of this.arrows)if(a.label){const p=P(...a.from),q=P(...a.to),t=arrowText(p,q);labels.push({text:a.label,box:textBox(t.x,t.y,a.label,t.anchor,10)});}
  for(const l of this.labels){const t=labelPlace(l,P,W,H);labels.push({text:l.text,box:textBox(t.x,t.y,l.text,l.anchor,8.5)});}
  const markers:FigureLayout['markers']=[],R=7;
  for(const m of this.markers){
   const anchor=m.part?partAnchor(m.part,m.at?P(...m.at):undefined,solids,paths,arrows,markers.map(k=>k.center)):P(...m.at!);
   const center=m.dx||m.dy?placeCircle(anchor,[m.dx,m.dy],R,W,H,markers,labels,arrows):anchor;
   markers.push({n:m.n,part:m.part,anchor,center,radius:R,leader:!!(m.dx||m.dy)});
  }
  return {width:W,height:H,solids:solids.map(({part,hull,role})=>({part,hull,role})),paths,arrows,labels,markers};
 }
 /** The figure's linework for a W × H view box: solids back to front, then paths, loads, labels and markers. */
 body(o:RenderOptions){
  const {W,H,P,V,order}=this.view(o),L=this.layout(o);
  let svg='';
  const st='vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"';
  for(const s of order){
   const front=s.faces.filter(f=>dot(cross(sub(f[1],f[0]),sub(f[2],f[1])),V)>1e-9);
   const focus=s.role==='focus';
   for(const f of front){
    const n=cross(sub(f[1],f[0]),sub(f[2],f[1])),top=Math.abs(n[2])>Math.abs(n[0])+Math.abs(n[1]);
    const fill=s.role==='ghost'?'none':focus?(top?tone.focus:tone.focusSide):tone.plate;
    svg+=`<path d="${poly(f.map(p=>P(...p)))}" fill="${fill}" stroke="${s.role==='ghost'?tone.mid:focus?tone.edge:tone.mid}" stroke-width="${focus?.8:.7}" ${st}${s.role==='ghost'?' stroke-dasharray="2 3"':''}/>`;
   }
   const sil=poly(hull(s.faces.flat().map(p=>P(...p))));
   svg+=`<path d="${sil}" fill="none" stroke="${focus?tone.hi:s.role==='ghost'?tone.mid:tone.edge}" stroke-width="${focus?1.25:.9}" ${st}${s.role==='existing'||s.role==='ghost'?' stroke-dasharray="5 3"':''}/>`;
  }
  for(const p of this.paths){
   const d='M'+p.pts.map(q=>P(...q).map(r2).join(' ')).join('L');
   if(p.role==='dim'){
    const a=P(...p.pts[0]),b=P(...p.pts[1]),L=Math.hypot(b[0]-a[0],b[1]-a[1])||1,n=[-(b[1]-a[1])/L*3.5,(b[0]-a[0])/L*3.5];
    svg+=`<path d="M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}M${r2(a[0]-n[0])} ${r2(a[1]-n[1])}L${r2(a[0]+n[0])} ${r2(a[1]+n[1])}M${r2(b[0]-n[0])} ${r2(b[1]-n[1])}L${r2(b[0]+n[0])} ${r2(b[1]+n[1])}" fill="none" stroke="${tone.hi}" stroke-width=".6" ${st}/>`;continue;
   }
   svg+=p.role==='center'?`<path d="${d}" fill="none" stroke="${tone.edge}" stroke-width=".7" stroke-dasharray="12 3 2 3" ${st}/>`:p.role==='line'?`<path d="${d}" fill="none" stroke="${tone.hi}" stroke-width=".9" ${st}/>`:p.role==='rod'?`<path d="${d}" fill="none" stroke="${tone.hi}" stroke-width="1.8" ${st}/>`:`<path d="${d}" fill="none" stroke="${tone.hi}" stroke-width="1.1" stroke-dasharray="1.2 3" ${st}/>`;
  }
  for(const a of this.arrows){
   const p=P(...a.from),q=P(...a.to),ang=Math.atan2(q[1]-p[1],q[0]-p[0]),h=7;
   svg+=`<path d="M${r2(p[0])} ${r2(p[1])}L${r2(q[0]-4*Math.cos(ang))} ${r2(q[1]-4*Math.sin(ang))}" fill="none" stroke="${tone.hi}" stroke-width="1.6"${a.dashed?' stroke-dasharray="4 3"':''} ${st}/><path d="M${r2(q[0])} ${r2(q[1])}L${r2(q[0]-h*Math.cos(ang-.38))} ${r2(q[1]-h*Math.sin(ang-.38))}L${r2(q[0]-h*Math.cos(ang+.38))} ${r2(q[1]-h*Math.sin(ang+.38))}Z" fill="${tone.hi}"/>`;
   if(a.label){const t=arrowText(p,q);svg+=text(t.x,t.y,a.label,t.anchor,true,10);}
  }
  for(const l of this.labels){const t=labelPlace(l,P,W,H);svg+=text(t.x,t.y,l.text,l.anchor,l.bold,8.5);}
  for(const m of L.markers){
   const p=m.anchor,c=m.center;
   if(m.leader)svg+=`<path d="M${r2(p[0])} ${r2(p[1])}L${r2(c[0])} ${r2(c[1])}" stroke="${tone.hi}" stroke-width=".7" ${st}/><circle cx="${r2(p[0])}" cy="${r2(p[1])}" r="1.4" fill="${tone.hi}"/>`;
   svg+=`<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${m.radius}" fill="${tone.plate}" stroke="${tone.hi}" stroke-width="1.1"/><text x="${r2(c[0])}" y="${r2(c[1]+3.3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" font-weight="700" fill="${tone.hi}">${m.n}</text>`;
  }
  return svg;
 }
 /** The complete figure. */
 render(o:RenderOptions&{title:string;desc:string;topic?:string;className?:string}){
  const W=o.width??400,H=o.height??300;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}"${o.topic?` data-check-figure="${esc(o.topic)}"`:''} class="${o.className??'hairline-figure'}"><title>${esc(o.title)}</title><desc>${esc(o.desc)}</desc>${this.body(o)}</svg>`;
 }
}
export interface RenderOptions{az?:number;k?:number;width?:number;height?:number;extra?:Vec3[];margin?:[number,number]}
function text(x:number,y:number,t:string,anchor:string,bold:boolean|undefined,size:number){
 return `<text x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${size}"${bold?' font-weight="700"':''} fill="${tone.hi}" stroke="${tone.plate}" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">${esc(t)}</text>`;
}

/** Where a load's label is written: beside its tail. */
const arrowText=(p:Vec2,q:Vec2)=>({x:p[0]+(p[0]<=q[0]?-4:4),y:p[1]+(p[1]<=q[1]?-3:10),anchor:(p[0]<=q[0]?'end':'start') as Label['anchor']});
/** A label kept inside the figure box by its estimated width. */
function labelPlace(l:Label,P:Projector,W:number,H:number){
 const p=P(...l.at),w=l.text.length*8.5*.56,lo=l.anchor==='start'?0:l.anchor==='middle'?w/2:w,hi=w-lo;
 return {x:Math.min(W-3-hi,Math.max(3+lo,p[0]+l.dx)),y:Math.min(H-3,Math.max(10,p[1]+l.dy))};
}
/** The paper box of a line of text (Arial, about .56 em per character), baseline at y. */
export function textBox(x:number,y:number,t:string,anchor:Label['anchor'],size:number):[number,number,number,number]{
 const w=[...t].length*size*.56,x0=anchor==='start'?x:anchor==='middle'?x-w/2:x-w;return [x0,y-size*.75,x0+w,y+size*.22];
}
export function inPolygon(q:Vec2,poly:Vec2[]){
 let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;
}
/** Distance from q to the segment ab. */
export function segmentDistance(q:Vec2,a:Vec2,b:Vec2){
 const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L)):0;return Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy);
}
/** The distance from q to the edges of a polygon. */
const edgeDistance=(q:Vec2,poly:Vec2[])=>Math.min(...poly.map((a,i)=>segmentDistance(q,a,poly[(i+1)%poly.length])));
/** Do the segments ab and cd cross? */
export function segmentsCross(a:Vec2,b:Vec2,c:Vec2,d:Vec2){
 const o=(p:Vec2,q:Vec2,r:Vec2)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0;
}
/** Distance from a point to a box, zero inside it. */
export const boxDistance=(q:Vec2,b:[number,number,number,number])=>Math.hypot(Math.max(b[0]-q[0],0,q[0]-b[2]),Math.max(b[1]-q[1],0,q[1]-b[3]));
/** Does the segment ab pass through the box (grown by g)? */
export function segmentHitsBox(a:Vec2,b:Vec2,x:[number,number,number,number],g=0){
 const B:[number,number,number,number]=[x[0]-g,x[1]-g,x[2]+g,x[3]+g];
 if(boxDistance(a,B)===0||boxDistance(b,B)===0)return true;
 const c:Vec2[]=[[B[0],B[1]],[B[2],B[1]],[B[2],B[3]],[B[0],B[3]]];
 return c.some((p,i)=>segmentsCross(a,b,p,c[(i+1)%4]));
}
/**
 * The point a marker's leader ends at: on a solid tagged with the key, inside its silhouette and not covered by a
 * nearer solid of another part, as near the hint as possible; else on a tagged line or load.
 */
function partAnchor(key:string,hint:Vec2|undefined,solids:{part?:string;hull:Vec2[];role:Role}[],paths:{part?:string;pts:Vec2[]}[],arrows:{part?:string;from:Vec2;to:Vec2}[],taken:Vec2[]=[]):Vec2{
 const free=(q:Vec2)=>taken.every(c=>Math.hypot(q[0]-c[0],q[1]-c[1])>10);
 const tagged=solids.map((s,i)=>({s,i})).filter(v=>partMatches(key,v.s.part)),solid=tagged.filter(v=>v.s.role!=='ghost'),own=solid.length?solid:tagged;
 if(own.length){
  const target=hint??centroid(own.reduce((a,b)=>area(b.s.hull)>area(a.s.hull)?b:a).s.hull);
  let best:Vec2|undefined,bestD=1e9;
  for(const {s,i} of own){
   const h=s.hull,[x0,y0,x1,y1]=bounds(h),cands:Vec2[]=[centroid(h)];if(hint)cands.push(hint);
   for(let u=1;u<12;u++)for(let v=1;v<12;v++)cands.push([x0+(x1-x0)*u/12,y0+(y1-y0)*v/12]);
   for(const q of cands){
    if(!inPolygon(q,h)||edgeDistance(q,h)<1.2||!free(q))continue;
    // Covered by a solid of another part painted later (nearer the viewer)?
    if(solids.slice(i+1).some(f=>!partMatches(key,f.part)&&inPolygon(q,f.hull)&&edgeDistance(q,f.hull)>.3))continue;
    const d=Math.hypot(q[0]-target[0],q[1]-target[1]);if(d<bestD){bestD=d;best=q;}
   }
  }
  return best??centroid(own[0].s.hull);
 }
 const lines=[...paths.filter(p=>partMatches(key,p.part)).map(p=>p.pts),...arrows.filter(a=>partMatches(key,a.part)).map(a=>[a.from,a.to])];
 if(!lines.length)throw Error(`Figure marker: no part tagged ${key}`);
 const target=hint??lines[0][Math.floor(lines[0].length/2)];
 let best:Vec2=lines[0][0],bestD=1e9;
 for(const pts of lines)for(let i=0;i+1<pts.length;i++){const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((target[0]-a[0])*dx+(target[1]-a[1])*dy)/L)):0,q:Vec2=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(q[0]-target[0],q[1]-target[1]);if(d<bestD){bestD=d;best=q;}}
 return best;
}
const bounds=(h:Vec2[])=>[Math.min(...h.map(p=>p[0])),Math.min(...h.map(p=>p[1])),Math.max(...h.map(p=>p[0])),Math.max(...h.map(p=>p[1]))];
const area=(h:Vec2[])=>Math.abs(h.reduce((a,p,i)=>{const q=h[(i+1)%h.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2;
function centroid(h:Vec2[]):Vec2{
 const A=h.reduce((a,p,i)=>{const q=h[(i+1)%h.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2;
 if(Math.abs(A)<1e-9)return [h.reduce((a,p)=>a+p[0],0)/h.length,h.reduce((a,p)=>a+p[1],0)/h.length];
 let cx=0,cy=0;for(let i=0;i<h.length;i++){const p=h[i],q=h[(i+1)%h.length],c=p[0]*q[1]-q[0]*p[1];cx+=(p[0]+q[0])*c;cy+=(p[1]+q[1])*c;}
 return [cx/(6*A),cy/(6*A)];
}
/**
 * The marker circle for an anchor: the preferred offset when it is clear, otherwise the nearest clear position
 * around the anchor. Clear: inside the box, off the other circles, labels and load arrows, and its leader crossing
 * no other leader, circle or label.
 */
function placeCircle(p:Vec2,pref:[number,number],R:number,W:number,H:number,placed:FigureLayout['markers'],labels:FigureLayout['labels'],arrows:{from:Vec2;to:Vec2}[]):Vec2{
 const len=Math.max(18,Math.hypot(pref[0],pref[1])),a0=Math.atan2(pref[1],pref[0]);
 const cands:Vec2[]=[[p[0]+pref[0],p[1]+pref[1]]];
 for(const r of [len,len+8,len-6,len+16,len+26,len+38,len+52])for(let k=1;k<=12;k++)for(const s of [1,-1]){const a=a0+s*k*Math.PI/12;if(r>=16)cands.push([p[0]+r*Math.cos(a),p[1]+r*Math.sin(a)]);}
 const cost=(c:Vec2)=>{
  let bad=0;
  if(c[0]<R+1||c[0]>W-R-1||c[1]<R+1||c[1]>H-R-1)bad+=100;
  for(const m of placed){
   if(Math.hypot(c[0]-m.center[0],c[1]-m.center[1])<2*R+3)bad+=50;
   if(m.leader&&segmentsCross(p,c,m.anchor,m.center))bad+=40;
   if(m.leader&&segmentDistance(c,m.anchor,m.center)<R+1.5)bad+=30;
   if(segmentDistance(m.center,p,c)<R+1.5)bad+=30;
  }
  for(const l of labels){if(boxDistance(c,l.box)<R+1)bad+=30;if(segmentHitsBox(p,[c[0]-(c[0]-p[0])*R/Math.max(1,Math.hypot(c[0]-p[0],c[1]-p[1])),c[1]-(c[1]-p[1])*R/Math.max(1,Math.hypot(c[0]-p[0],c[1]-p[1]))],l.box,.5))bad+=20;}
  for(const a of arrows)if(segmentDistance(c,a.from,a.to)<R+1)bad+=10;
  return bad;
 };
 let best=cands[0],bestCost=cost(best);
 for(const c of cands){if(bestCost===0)break;const k=cost(c);if(k<bestCost){best=c;bestCost=k;}}
 return best;
}
/**
 * Back to front: solid A is behind B when they are separated along an axis and A lies on the far side of it for
 * the view direction V. Non-overlapping convex solids order exactly; overlapping boxes fall back to depth.
 */
function sortSolids(solids:Solid[],V:Vec3){
 const n=solids.length,behind=(a:Solid,b:Solid)=>{for(const i of [0,1,2]){if(V[i]>0&&a.max[i]<=b.min[i]+1e-6)return true;if(V[i]<0&&a.min[i]>=b.max[i]-1e-6)return true;}return false;};
 const depth=(s:Solid)=>dot([(s.min[0]+s.max[0])/2,(s.min[1]+s.max[1])/2,(s.min[2]+s.max[2])/2],V);
 const edges:number[][]=Array.from({length:n},()=>[]),indeg=new Array(n).fill(0);
 for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j&&behind(solids[i],solids[j])&&!behind(solids[j],solids[i])){edges[i].push(j);indeg[j]++;}
 const out:Solid[]=[],done=new Array(n).fill(false);
 while(out.length<n){
  // Among the solids nothing is in front of, paint the farthest first; a cycle falls back to the farthest left.
  let pick=-1;for(let i=0;i<n;i++)if(!done[i]&&indeg[i]===0&&(pick<0||depth(solids[i])<depth(solids[pick])))pick=i;
  if(pick<0)for(let i=0;i<n;i++)if(!done[i]&&(pick<0||depth(solids[i])<depth(solids[pick])))pick=i;
  done[pick]=true;out.push(solids[pick]);for(const j of edges[pick])indeg[j]--;
 }
 return out;
}
export type {Vec3,Vec2,Projector};
