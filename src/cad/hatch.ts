/**
 * Hatching: AutoCAD-style patterns (families of dashed parallel lines, in paper inches), clipped to boundary loops
 * by the even-odd rule; solid fills as trapezoids; and boundary detection from a picked point.
 */
type Pt=[number,number];
const DEG=Math.PI/180;
const sub=(a:Pt,b:Pt):Pt=>[a[0]-b[0],a[1]-b[1]],add=(a:Pt,b:Pt):Pt=>[a[0]+b[0],a[1]+b[1]],mul=(a:Pt,k:number):Pt=>[a[0]*k,a[1]*k];
const dot=(a:Pt,b:Pt)=>a[0]*b[0]+a[1]*b[1],cross=(a:Pt,b:Pt)=>a[0]*b[1]-a[1]*b[0],dist=(a:Pt,b:Pt)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

/** One line family: angle (deg), origin, offset (dx along the line, dy across), dashes (+ dash, - gap, 0 dot). */
export interface PatternLine{angle:number;origin:Pt;delta:Pt;dashes:number[]}
export interface HatchPattern{name:string;description:string;lines:PatternLine[]}
const L=(angle:number,ox:number,oy:number,dx:number,dy:number,...dashes:number[]):PatternLine=>({angle,origin:[ox,oy],delta:[dx,dy],dashes});
export const hatchPatterns:Record<string,HatchPattern>={
 SOLID:{name:'SOLID',description:'Solid fill',lines:[]},
 ANSI31:{name:'ANSI31',description:'ANSI iron, brick, stone masonry',lines:[L(45,0,0,0,.125)]},
 ANSI32:{name:'ANSI32',description:'ANSI steel',lines:[L(45,0,0,0,.375),L(45,.176776695,0,0,.375)]},
 ANSI33:{name:'ANSI33',description:'ANSI bronze, brass, copper',lines:[L(45,0,0,0,.25),L(45,.176776695,0,0,.25,.125,-.0625)]},
 ANSI37:{name:'ANSI37',description:'ANSI lead, zinc, magnesium, insulation',lines:[L(45,0,0,0,.125),L(135,0,0,0,.125)]},
 ANSI38:{name:'ANSI38',description:'ANSI aluminum',lines:[L(45,0,0,0,.125),L(135,0,0,.25,.125,.3125,-.1875)]},
 STEEL:{name:'STEEL',description:'Steel material',lines:[L(45,0,0,0,.125),L(45,0,.0625,0,.125)]},
 NET:{name:'NET',description:'Horizontal and vertical grid',lines:[L(0,0,0,0,.125),L(90,0,0,0,.125)]},
 LINE:{name:'LINE',description:'Parallel horizontal lines',lines:[L(0,0,0,0,.125)]},
 BRICK:{name:'BRICK',description:'Brick or masonry',lines:[L(0,0,0,0,.25),L(90,0,0,.25,.25,.25,-.25)]},
 EARTH:{name:'EARTH',description:'Earth or ground',lines:[L(0,0,0,.25,.25,.25,-.25),L(0,0,.09375,.25,.25,.25,-.25),L(0,0,.1875,.25,.25,.25,-.25),L(90,.03125,.21875,.25,.25,.25,-.25),L(90,.125,.21875,.25,.25,.25,-.25),L(90,.21875,.21875,.25,.25,.25,-.25)]},
 'AR-CONC':{name:'AR-CONC',description:'Random dot and stone pattern (concrete)',lines:[L(50,0,0,.104,.229,.075,-.48),L(355,0,0,-.054,.262,.06,-.5),L(100.4,.066,.05,.24,.185,.065,-.53),L(46.2,0,.08,.27,.15,0,-.38),L(96.7,.03,.03,.23,.21,0,-.44),L(23,.1,.2,.3,.17,0,-.5)]},
 'AR-SAND':{name:'AR-SAND',description:'Random dot pattern (sand, grout)',lines:[L(37.5,0,0,.07,.11,0,-.21,0,-.15),L(7.5,.02,.03,.11,.09,0,-.17,0,-.23),L(-32.5,.05,.01,.13,.1,0,-.19,0,-.13)]},
 GRAVEL:{name:'GRAVEL',description:'Gravel',lines:[L(228,.18,.12,.24,.16,.05,-.42),L(17,.04,.1,.22,.15,.06,-.39),L(108,.12,.03,.18,.2,.04,-.36),L(70,.07,.15,.21,.17,0,-.31)]},
 DOTS:{name:'DOTS',description:'A series of dots',lines:[L(0,0,0,.03125,.0625,0,-.0625)]},
 HONEY:{name:'HONEY',description:'Honeycomb',lines:[L(0,0,0,.1875,.108253175,.125,-.25),L(120,0,0,.1875,.108253175,.125,-.25),L(60,.125,0,.1875,.108253175,.125,-.25)]},
 INSUL:{name:'INSUL',description:'Insulation material (lines and dashes)',lines:[L(0,0,0,0,.375),L(0,0,.125,0,.375,.125,-.125),L(0,0,.25,0,.375,.125,-.125)]},
};
export const patternNames=Object.keys(hatchPatterns);

// ---- clipping ------------------------------------------------------------------------------------------------------
/** Parameters along the line o + t u where it crosses the loop edges, sorted (even-odd pairs are inside). */
function crossings(o:Pt,u:Pt,loops:Pt[][]):number[]{
 const ts:number[]=[];
 for(const loop of loops)for(let i=0;i<loop.length;i++){
  const a=loop[i],b=loop[(i+1)%loop.length],e=sub(b,a),den=cross(u,e);if(Math.abs(den)<1e-14)continue;
  const ao=sub(a,o),t=cross(ao,e)/den,s=cross(ao,u)/den;
  // Half-open on the edge parameter so a crossing at a shared vertex counts once.
  if(s>=0&&s<1)ts.push(t);
 }
 return ts.sort((x,y)=>x-y);
}
export interface HatchSpec{loops:Pt[][];pattern:string;scale:number;angle:number;origin?:Pt}
/** The pattern's line segments inside the loops, in drawing units (unitScale: drawing units per inch of pattern). */
export function hatchSegments(h:HatchSpec,unitScale:number,limit=60000):[Pt,Pt][]{
 const pat=hatchPatterns[h.pattern];if(!pat||!pat.lines.length||!h.loops.length)return [];
 const k=h.scale*unitScale,origin=h.origin??[0,0],out:[Pt,Pt][]=[];
 let lo:Pt=[Infinity,Infinity],hi:Pt=[-Infinity,-Infinity];
 for(const loop of h.loops)for(const p of loop){lo=[Math.min(lo[0],p[0]),Math.min(lo[1],p[1])];hi=[Math.max(hi[0],p[0]),Math.max(hi[1],p[1])];}
 const corners:Pt[]=[lo,[hi[0],lo[1]],hi,[lo[0],hi[1]]];
 for(const fam of pat.lines){
  const th=(fam.angle+h.angle)*DEG,u:Pt=[Math.cos(th),Math.sin(th)],n:Pt=[-u[1],u[0]];
  const rot=(v:Pt):Pt=>{const c=Math.cos(h.angle*DEG),s=Math.sin(h.angle*DEG);return [v[0]*c-v[1]*s,v[0]*s+v[1]*c];};
  const o0=add(origin,mul(rot(fam.origin),k)),fu:Pt=[Math.cos(fam.angle*DEG),Math.sin(fam.angle*DEG)],fn:Pt=[-fu[1],fu[0]];
  const D=mul(rot(add(mul(fu,fam.delta[0]),mul(fn,fam.delta[1]))),k),dn=dot(D,n);if(Math.abs(dn)<1e-12)continue;
  const offs=corners.map(c=>dot(sub(c,o0),n)/dn),k0=Math.ceil(Math.min(...offs)-1e-9),k1=Math.floor(Math.max(...offs)+1e-9);
  if(k1-k0>limit)return out;
  const dashes=fam.dashes.map(d=>d*k),period=dashes.reduce((s,d)=>s+Math.abs(d),0);
  for(let j=k0;j<=k1;j++){
   const o=add(o0,mul(D,j)),ts=crossings(o,u,h.loops);
   for(let i=0;i+1<ts.length;i+=2){
    const t0=ts[i],t1=ts[i+1];if(t1-t0<1e-12)continue;
    if(!dashes.length||period<1e-12){out.push([add(o,mul(u,t0)),add(o,mul(u,t1))]);continue;}
    // Walk the dash sequence from the line's own origin (each line starts its pattern at o).
    let t=Math.floor(t0/period)*period;
    for(let guard=0;t<t1&&guard<100000;guard++){
     for(const d of dashes){
      const len=Math.abs(d),a=t,b=t+len;
      if(d>=0&&b>=t0&&a<=t1){const s=Math.max(a,t0),e=Math.min(b,t1);if(d===0){if(a>=t0&&a<=t1){const p=add(o,mul(u,a));out.push([p,p]);}}else if(e>s)out.push([add(o,mul(u,s)),add(o,mul(u,e))]);}
      t=b;if(t>=t1)break;
     }
    }
    if(out.length>limit)return out;
   }
  }
 }
 return out;
}
/** A solid fill as trapezoids (4-point solids) between scanlines through every vertex, even-odd. */
export function fillTrapezoids(loops:Pt[][]):Pt[][]{
 const ys=[...new Set(loops.flat().map(p=>p[1]))].sort((a,b)=>a-b),edges:[Pt,Pt][]=[];
 for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];if(a[1]!==b[1])edges.push(a[1]<b[1]?[a,b]:[b,a]);}
 const xAt=(e:[Pt,Pt],y:number)=>e[0][0]+(e[1][0]-e[0][0])*(y-e[0][1])/(e[1][1]-e[0][1]);
 const out:Pt[][]=[];
 for(let i=0;i+1<ys.length;i++){
  const y0=ys[i],y1=ys[i+1],ym=(y0+y1)/2;
  const act=edges.filter(e=>e[0][1]<=ym&&e[1][1]>ym).sort((a,b)=>xAt(a,ym)-xAt(b,ym));
  for(let j=0;j+1<act.length;j+=2){const a=act[j],b=act[j+1];out.push([[xAt(a,y0),y0],[xAt(b,y0),y0],[xAt(b,y1),y1],[xAt(a,y1),y1]]);}
 }
 return out;
}
/** Even-odd inside test for a set of loops. */
export function insideLoops(p:Pt,loops:Pt[][]){
 let inside=false;
 for(const poly of loops)for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>p[1])!==(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)inside=!inside;}
 return inside;
}
export const loopArea=(loop:Pt[])=>{let a=0;for(let i=0;i<loop.length;i++){const p=loop[i],q=loop[(i+1)%loop.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;};
/** Area of an even-odd hatch: outer loops minus islands (loops inside an odd number of others). */
export function hatchArea(loops:Pt[][]){
 return loops.reduce((s,l,i)=>{const depth=loops.filter((m,j)=>j!==i&&insideLoops(l[0],[m])).length;return s+(depth%2?-1:1)*Math.abs(loopArea(l));},0);
}

// ---- boundary detection --------------------------------------------------------------------------------------------
/**
 * The smallest closed region around p formed by the segments (curves already as chords): the segments are split at
 * their crossings into a planar graph, and the face holding p is walked keeping it on the left. Undefined when p is
 * not enclosed.
 */
export function findBoundary(p:Pt,segs:[Pt,Pt][],tol=1e-7):Pt[]|undefined{
 if(!segs.length)return undefined;
 // Split segments at mutual crossings, using a grid to find candidate pairs.
 let lo:Pt=[Infinity,Infinity],hi:Pt=[-Infinity,-Infinity];
 for(const [a,b] of segs){lo=[Math.min(lo[0],a[0],b[0]),Math.min(lo[1],a[1],b[1])];hi=[Math.max(hi[0],a[0],b[0]),Math.max(hi[1],a[1],b[1])];}
 const span=Math.max(hi[0]-lo[0],hi[1]-lo[1],1e-9),eps=Math.max(tol,span*1e-9),cells=Math.max(1,Math.min(256,Math.ceil(Math.sqrt(segs.length)))),cs=span/cells;
 const grid=new Map<number,number[]>(),cellOf=(x:number,y:number)=>[Math.min(cells-1,Math.max(0,Math.floor((x-lo[0])/cs))),Math.min(cells-1,Math.max(0,Math.floor((y-lo[1])/cs)))];
 segs.forEach(([a,b],i)=>{const [x0,y0]=cellOf(Math.min(a[0],b[0]),Math.min(a[1],b[1])),[x1,y1]=cellOf(Math.max(a[0],b[0]),Math.max(a[1],b[1]));for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const k=x*cells+y;let l=grid.get(k);if(!l)grid.set(k,l=[]);l.push(i);}});
 const cuts:number[][]=segs.map(()=>[0,1]);
 for(const list of grid.values())for(let x=0;x<list.length;x++)for(let y=x+1;y<list.length;y++){
  const i=list[x],j=list[y];
  const [a,b]=segs[i],[c,d]=segs[j],r=sub(b,a),s=sub(d,c),den=cross(r,s);if(Math.abs(den)<1e-18)continue;
  const ca=sub(c,a),t=cross(ca,s)/den,u=cross(ca,r)/den,et=eps/Math.max(1e-12,Math.hypot(...r)),eu=eps/Math.max(1e-12,Math.hypot(...s));
  if(t<-et||t>1+et||u<-eu||u>1+eu)continue;
  cuts[i].push(Math.max(0,Math.min(1,t)));cuts[j].push(Math.max(0,Math.min(1,u)));
 }
 // Nodes merged within eps; undirected edges between consecutive cut points.
 const nodes:Pt[]=[],nodeGrid=new Map<string,number[]>(),key=(q:Pt)=>`${Math.round(q[0]/(eps*10))},${Math.round(q[1]/(eps*10))}`;
 const nodeOf=(q:Pt)=>{const [gx,gy]=key(q).split(',').map(Number);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const n of nodeGrid.get(`${gx+dx},${gy+dy}`)??[])if(dist(nodes[n],q)<=eps*10)return n;const id=nodes.push(q)-1,kk=key(q);let l=nodeGrid.get(kk);if(!l)nodeGrid.set(kk,l=[]);l.push(id);return id;};
 const adj=new Map<number,Set<number>>(),link=(i:number,j:number)=>{if(i===j)return;(adj.get(i)??adj.set(i,new Set()).get(i)!).add(j);(adj.get(j)??adj.set(j,new Set()).get(j)!).add(i);};
 segs.forEach(([a,b],i)=>{const ts=[...new Set(cuts[i].map(t=>+t.toFixed(12)))].sort((x,y)=>x-y);let prev=nodeOf(a);for(const t of ts.slice(1)){const q:Pt=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],n=nodeOf(q);link(prev,n);prev=n;}});
 // Prune dangling edges (degree 1) repeatedly: they bound no face.
 for(let changed=true;changed;){changed=false;for(const [n,set] of adj)if(set.size<2){for(const m of set)adj.get(m)?.delete(n);adj.delete(n);changed=true;}}
 if(!adj.size)return undefined;
 // The nearest edge to the right of p along +x.
 let best:{a:number;b:number;x:number}|undefined;
 for(const [a,set] of adj)for(const b of set){if(a>b)continue;const A=nodes[a],B=nodes[b];if((A[1]>p[1])===(B[1]>p[1]))continue;const x=A[0]+(B[0]-A[0])*(p[1]-A[1])/(B[1]-A[1]);if(x>p[0]&&(!best||x<best.x))best={a,b,x};}
 if(!best)return undefined;
 let [from,to]=cross(sub(nodes[best.b],nodes[best.a]),sub(p,nodes[best.a]))>0?[best.a,best.b]:[best.b,best.a];
 const start=`${from}>${to}`,loop:Pt[]=[];
 const ang=(i:number,j:number)=>Math.atan2(nodes[j][1]-nodes[i][1],nodes[j][0]-nodes[i][0]);
 for(let guard=0;guard<200000;guard++){
  loop.push(nodes[from]);
  const back=ang(to,from);let next=-1,bd=Infinity;
  for(const w of adj.get(to)!){let d=back-ang(to,w);d=((d%(2*Math.PI))+2*Math.PI)%(2*Math.PI);if(w===from)d=2*Math.PI;if(d<1e-12)d=2*Math.PI;if(d<bd){bd=d;next=w;}}
  from=to;to=next;
  if(`${from}>${to}`===start)break;
 }
 if(loop.length<3||loopArea(loop)<=0||!insideLoops(p,[loop]))return undefined;
 return loop;
}
