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
interface Solid{faces:Vec3[][];min:Vec3;max:Vec3;role:Role}
interface Arrow{from:Vec3;to:Vec3;label?:string;dashed?:boolean}
interface Marker{n:number;at:Vec3;dx:number;dy:number}
interface Label{text:string;at:Vec3;dx:number;dy:number;anchor:'start'|'middle'|'end';bold?:boolean}
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
 private solids:Solid[]=[];private shift:Vec3=[0,0,0];
 /** Moves the solids added from now on by (dx, dy, dz): a part drawn at the origin, placed elsewhere. */
 at(dx=0,dy=0,dz=0){this.shift=[dx,dy,dz];return this;}
 private arrows:Arrow[]=[];private markers:Marker[]=[];private labels:Label[]=[];private paths:{pts:Vec3[];role:'path'|'center'|'line'|'rod'|'dim'}[]=[];
 /** An axis-aligned plate or block. */
 box(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,role:Role='context'){
  return this.prism(2,[[Math.min(x0,x1),Math.min(y0,y1)],[Math.max(x0,x1),Math.min(y0,y1)],[Math.max(x0,x1),Math.max(y0,y1)],[Math.min(x0,x1),Math.max(y0,y1)]],Math.min(z0,z1),Math.max(z0,z1),role);
 }
 /** A convex profile swept along a world axis (0 x, 1 y, 2 z) from a to b. */
 prism(axis:Axis,profile:Vec2[],a:number,b:number,role:Role='context'){
  // The y axis takes its profile in (x, z), a left-handed pair: reverse it so every face normal points outward.
  const prof=ccw(profile),[dx,dy,dz]=this.shift,faces=extrude(axis,axis===1?prof.slice().reverse():prof,Math.min(a,b),Math.max(a,b)).map(f=>f.map(q=>[q[0]+dx,q[1]+dy,q[2]+dz] as Vec3)),pts=faces.flat();
  this.solids.push({faces,role,min:[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))) as Vec3,max:[0,1,2].map(i=>Math.max(...pts.map(p=>p[i]))) as Vec3});return this;
 }
 /** A round bar (bolt, rod) as a 12-sided prism. */
 cylinder(axis:Axis,c:Vec2,r:number,a:number,b:number,role:Role='context'){
  return this.prism(axis,Array.from({length:12},(_,i)=>[c[0]+r*Math.cos(i*Math.PI/6),c[1]+r*Math.sin(i*Math.PI/6)] as Vec2),a,b,role);
 }
 /** A load: a heavy shaft and a solid head at `to`. */
 arrow(from:Vec3,to:Vec3,label?:string,dashed=false){this.arrows.push({from,to,label,dashed});return this;}
 /** A numbered load-path marker, offset on the paper by (dx, dy) from the projected point with a short leader. */
 marker(n:number,at:Vec3,dx=0,dy=0){this.markers.push({n,at,dx,dy});return this;}
 label(text:string,at:Vec3,dx=0,dy=0,anchor:Label['anchor']='start',bold=false){this.labels.push({text,at,dx,dy,anchor,bold});return this;}
 /** The load path, dotted through the parts it crosses, drawn over the solids. */
 path(pts:Vec3[]){this.paths.push({pts,role:'path'});return this;}
 centerline(a:Vec3,b:Vec3){this.paths.push({pts:[a,b],role:'center'});return this;}
 /** A thin solid line: a deflected shape, a diagram or a leader. */
 line(pts:Vec3[]){this.paths.push({pts,role:'line'});return this;}
 /** A rod or bar that is not along a world axis (a diagonal brace), drawn as a heavy line over the solids. */
 rod(a:Vec3,b:Vec3){this.paths.push({pts:[a,b],role:'rod'});return this;}
 /** A dimension: thin line with ticks at both ends and its text at the middle. */
 dim(a:Vec3,b:Vec3,text:string,dx=0,dy=-4){this.paths.push({pts:[a,b],role:'dim'});return this.label(text,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],dx,dy,'middle');}

 /** The figure's linework for a W × H view box: solids back to front, then paths, loads, labels and markers. */
 body(o:RenderOptions){
  const W=o.width??400,H=o.height??300,C=Cam(o.az??38,o.k??.5,1),[mx,my]=o.margin??[56,44];
  // Scale so the drawing fills the box with a margin for markers and labels.
  const pts=[...this.solids.flatMap(s=>s.faces.flat()),...this.arrows.flatMap(a=>[a.from,a.to]),...this.paths.flatMap(p=>p.pts),...this.labels.map(l=>l.at),...(o.extra??[])];
  const P0=proj(C);let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const p of pts){const q=P0(...p);x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1]);}
  C.S=Math.min((W-mx)/Math.max(x1-x0,1e-6),(H-my)/Math.max(y1-y0,1e-6));fit(C,pts,W/2,H/2);
  const P=proj(C),zf=Math.sqrt(1-C.k*C.k),V:Vec3=[Math.sin(C.az),Math.cos(C.az),C.k/zf];
  const order=sortSolids(this.solids,V);
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
   if(a.label)svg+=text(p[0]+(p[0]<=q[0]?-4:4),p[1]+(p[1]<=q[1]?-3:10),a.label,p[0]<=q[0]?'end':'start',true,10);
  }
  for(const l of this.labels){
   // Kept inside the figure box by its estimated width.
   const p=P(...l.at),w=l.text.length*8.5*.56,lo=l.anchor==='start'?0:l.anchor==='middle'?w/2:w,hi=w-lo;
   svg+=text(Math.min(W-3-hi,Math.max(3+lo,p[0]+l.dx)),Math.min(H-3,Math.max(10,p[1]+l.dy)),l.text,l.anchor,l.bold,8.5);
  }
  for(const m of this.markers){
   // The circle stays inside the figure box; its leader still reaches the point.
   const p=P(...m.at),c:Vec2=[Math.min(W-8,Math.max(8,p[0]+m.dx)),Math.min(H-8,Math.max(8,p[1]+m.dy))];
   if(m.dx||m.dy)svg+=`<path d="M${r2(p[0])} ${r2(p[1])}L${r2(c[0])} ${r2(c[1])}" stroke="${tone.hi}" stroke-width=".7" ${st}/><circle cx="${r2(p[0])}" cy="${r2(p[1])}" r="1.4" fill="${tone.hi}"/>`;
   svg+=`<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="7" fill="${tone.plate}" stroke="${tone.hi}" stroke-width="1.1"/><text x="${r2(c[0])}" y="${r2(c[1]+3.3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" font-weight="700" fill="${tone.hi}">${m.n}</text>`;
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
