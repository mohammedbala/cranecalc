/** Sectorial integration of a connected, open median-line tree.
 * x is lateral; y is above the bottom of the section. Omega = integral(y dx-x dy).
 * Projection removes uniform axial strain and weak-axis flexure. For the sections
 * used here x=0 is the symmetry axis. Sources: Ellifritt/Lue (1998), Eqs.4-6;
 * Vlasov open-section mechanics. No closed-cell or distortion stiffness is inferred.
 */
export interface WallNode {x:number;y:number;}
export interface Wall {from:number;to:number;t:number;part:'beam'|'channel'|'link';}
const gx=[-.906179845938664,-.538469310105683,0,.538469310105683,.906179845938664];
const gw=[.236926885056189,.478628670499366,.568888888888889,.478628670499366,.236926885056189];
export function openSection(nodes:WallNode[],walls:Wall[]){
 const raw=nodes.map(()=>NaN);raw[0]=0;
 // Parent-first tree: zero-area links carry sectorial coordinates, not stiffness.
 for(const w of walls){const a=nodes[w.from],b=nodes[w.to];if(!Number.isFinite(raw[w.from])||Number.isFinite(raw[w.to]))throw Error('Open section requires a parent-first tree.');raw[w.to]=raw[w.from]+a.y*(b.x-a.x)-a.x*(b.y-a.y);}
 const integrate=(fn:(x:number,y:number,o:number,w:Wall)=>number)=>walls.reduce((sum,w)=>{
  const a=nodes[w.from],b=nodes[w.to],length=Math.hypot(b.x-a.x,b.y-a.y);return sum+gx.reduce((s,g,i)=>{const u=(g+1)/2;return s+gw[i]*length*w.t/2*fn(a.x+u*(b.x-a.x),a.y+u*(b.y-a.y),raw[w.from]+u*(raw[w.to]-raw[w.from]),w);},0);
 },0);
 const A=integrate(()=>1),cx=integrate(x=>x)/A,cy=integrate((_,y)=>y)/A;
 const Ix=integrate((_,y)=>(y-cy)**2),Iy=integrate(x=>(x-cx)**2),Ixy=integrate((x,y)=>(x-cx)*(y-cy));
 if(!(A>0&&Ix>0&&Iy>0)||Math.abs(cx)>1e-7||Math.abs(Ixy)>1e-8*Math.sqrt(Ix*Iy))throw Error('Section must be symmetric about the vertical axis.');
 const mean=integrate((_x,_y,o)=>o)/A,ys=integrate((x,_y,o)=>(o-mean)*x)/Iy;
 const omega=raw.map((o,i)=>o-mean-ys*nodes[i].x);
 const Cw=integrate((x,_y,o)=>(o-mean-ys*x)**2);
 const beta=integrate((x,y)=>(y-cy)*(x*x+(y-cy)**2))/Ix-2*(ys-cy);
 const J=walls.reduce((s,w)=>s+Math.hypot(nodes[w.to].x-nodes[w.from].x,nodes[w.to].y-nodes[w.from].y)*w.t**3/3,0);
 // Integrate sectorial area from every free tip inward. The maximum within a
 // straight wall occurs at an endpoint or where its linear omega changes sign.
 const subtree=nodes.map(()=>0);let shearCoefficient=0;
 for(const w of [...walls].reverse()){
  const length=Math.hypot(nodes[w.to].x-nodes[w.from].x,nodes[w.to].y-nodes[w.from].y),a=omega[w.from],b=omega[w.to];
  const integral=length*w.t*(a+b)/2,flow=subtree[w.to];
  if(w.t>0){const candidates=[0,1];if(a*b<0)candidates.push(-a/(b-a));for(const u of candidates){const q=flow+length*w.t*(a*(1-u)+(b-a)*(1-u*u)/2);shearCoefficient=Math.max(shearCoefficient,Math.abs(q)/w.t);}}
  subtree[w.from]+=flow+integral;
 }
 return {A,Ix,Iy,cy,shearCenter:ys,Cw,J,beta,omega,shearCoefficient,
  omegaHalfChannel:integrate((x,_y,o,w)=>w.part==='channel'&&x>0?o-mean-ys*x:0),
  orthogonality:{axial:integrate((x,_y,o)=>o-mean-ys*x),lateral:integrate((x,_y,o)=>(o-mean-ys*x)*x)},
  nodes,walls};
}
