/**
 * Prismatic vertically symmetric open I-member, small-displacement Vlasov theory.
 * Four DOFs/node: lateral translation v, v', twist theta, theta'. Units N/mm.
 * Elastic energy: 1/2 integral(EIy v''² + ECw theta''² + GJ theta'²).
 * Geometric energy: integral(M v'' theta) - N/2 integral(v'²+r0² theta'²)
 *                   - 1/2 sum(P z theta²).
 * End warping is free unless theta' is explicitly fixed. Cross-section distortion
 * and supporting-building deformation are outside this beam primitive.
 * Sources: Moore/Mueller, AISC EJ 39(4), 2002, pp.182–188;
 * Nayak et al., AISC EJ 61(3), 2024, Eq.6 (centroidal M-coupling).
 * Load-height term follows vertical-load potential P*z*(cos(theta)-1).
 */
export interface LateralTorsionLoad { x:number; lateral:number; torque:number; vertical?:number; height?:number; }
export interface FlangeRestraint { x:number; top:number; bottom:number; }
export interface LateralTorsionInput {
 length:number; E:number; G:number; Iy:number; J:number; Cw:number; h0:number; polarRadiusSquared:number;
 loads:LateralTorsionLoad[]; restraints:FlangeRestraint[];
 fixed?:{x:number; dofs:('v'|'slope'|'twist'|'warping')[]}[];
 subdivisions?:number; axial?:number; moment?:(x:number)=>number;
 distributedLateral?:number; distributedTorque?:number;
 distributedVertical?:number; distributedHeight?:number;
 topOffset?:number; bottomOffset?:number; centroidOffset?:number; monosymmetry?:number;
}
export interface LateralTorsionStation { x:number; v:number; slope:number; twist:number; twistRate:number; curvature:number; warpingCurvature:number; warpingThird:number; lateralThird:number; }
export interface LateralTorsionResult {
 stations:LateralTorsionStation[];
 restraints:{x:number; top:number; bottom:number; lateral:number; torque:number}[];
 fixedReactions:{x:number; dof:string; value:number}[];
 residual:number;
 at:(x:number,side?:'left'|'right')=>LateralTorsionStation;
}

// A banded matrix keeps each moving-load solve O(n*b²); local Hermite elements
// have bandwidth seven. Rows store the lower triangle including the diagonal.
const bw=7;
class BandMatrix {
 readonly a:Float64Array;
 constructor(readonly n:number){this.a=new Float64Array(n*(bw+1));}
 // Swaps use scalars: these run in the innermost assembly and factorization loops.
 get(i:number,j:number){if(i<j){const k=i;i=j;j=k;}return i-j>bw?0:this.a[i*(bw+1)+i-j];}
 add(i:number,j:number,value:number){if(i<j){const k=i;i=j;j=k;}if(i-j>bw){if(Math.abs(value)>1e-15)throw Error('Nonlocal stiffness outside element bandwidth.');return;}this.a[i*(bw+1)+i-j]+=value;}
 set(i:number,j:number,value:number){if(i<j){const k=i;i=j;j=k;}if(i-j<=bw)this.a[i*(bw+1)+i-j]=value;}
 multiply(x:Float64Array){const out=new Float64Array(this.n);for(let i=0;i<this.n;i++)for(let j=Math.max(0,i-bw);j<=Math.min(this.n-1,i+bw);j++)out[i]+=this.get(i,j)*x[j];return out;}
}
// Lower-band entry (i,j), i >= j, is stored at i*(bw+1)+i-j. Same operation order as get/set.
const at=(i:number,j:number)=>i*(bw+1)+i-j;
function factor(a:BandMatrix){
 const n=a.n,L=new BandMatrix(n),scale=new Float64Array(n),A=a.a,l=L.a;
 for(let i=0;i<n;i++){const d=A[at(i,i)];if(!(d>0))return null;scale[i]=Math.sqrt(d);}
 for(let i=0;i<n;i++)for(let j=Math.max(0,i-bw);j<=i;j++){
  let s=A[at(i,j)]/(scale[i]*scale[j]);
  for(let k=Math.max(0,i-bw,j-bw);k<j;k++)s-=l[at(i,k)]*l[at(j,k)];
  if(i===j){if(!Number.isFinite(s)||s<1e-12)return null;l[at(i,i)]=Math.sqrt(s);}
  else l[at(i,j)]=s/l[at(j,j)];
 }
 return {solve(f:Float64Array){
  const x=new Float64Array(n),y=new Float64Array(n);
  for(let i=0;i<n;i++){let s=f[i]/scale[i];for(let j=Math.max(0,i-bw);j<i;j++)s-=l[at(i,j)]*y[j];y[i]=s/l[at(i,i)];}
  for(let i=n-1;i>=0;i--){let s=y[i];for(let j=i+1;j<=Math.min(n-1,i+bw);j++)s-=l[at(j,i)]*x[j];x[i]=s/l[at(i,i)];}
  for(let i=0;i<n;i++)x[i]/=scale[i];return x;
 }};
}
export function hermite(t:number,L:number){
 return {
  n:[1-3*t*t+2*t*t*t,L*(t-2*t*t+t*t*t),3*t*t-2*t*t*t,L*(-t*t+t*t*t)],
  d:[(-6*t+6*t*t)/L,1-4*t+3*t*t,(6*t-6*t*t)/L,-2*t+3*t*t],
  dd:[(-6+12*t)/L**2,(-4+6*t)/L,(6-12*t)/L**2,(-2+6*t)/L],
  ddd:[12/L**3,6/L**2,-12/L**3,6/L**2]
 };
}
// Allocation-free Hermite values for the assembly loop; same expressions as hermite().
const scratch={n:new Float64Array(4),d:new Float64Array(4),dd:new Float64Array(4),ddd:new Float64Array(4)};
function hermiteInto(t:number,L:number){
 const h=scratch;
 h.n[0]=1-3*t*t+2*t*t*t;h.n[1]=L*(t-2*t*t+t*t*t);h.n[2]=3*t*t-2*t*t*t;h.n[3]=L*(-t*t+t*t*t);
 h.d[0]=(-6*t+6*t*t)/L;h.d[1]=1-4*t+3*t*t;h.d[2]=(6*t-6*t*t)/L;h.d[3]=-2*t+3*t*t;
 h.dd[0]=(-6+12*t)/L**2;h.dd[1]=(-4+6*t)/L;h.dd[2]=(6-12*t)/L**2;h.dd[3]=(-2+6*t)/L;
 return h;
}
const gaussX=[-.906179845938664,-.538469310105683,0,.538469310105683,.906179845938664];
const gaussW=[.236926885056189,.478628670499366,.568888888888889,.478628670499366,.236926885056189];
const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
const dofNames=['v','slope','twist','warping'];

export class LateralTorsionBeam {
 readonly nodes:number[];
 private readonly elastic:BandMatrix;
 private readonly geometric:BandMatrix;
 private readonly force:Float64Array;
 private readonly fixed:number[];
 constructor(readonly input:LateralTorsionInput){
  const p=input;
  for(const [k,v] of Object.entries({length:p.length,E:p.E,G:p.G,Iy:p.Iy,J:p.J,Cw:p.Cw,h0:p.h0,polarRadiusSquared:p.polarRadiusSquared}))if(!Number.isFinite(v)||v<=0)throw Error(`Invalid lateral/torsion ${k}.`);
  if((p.subdivisions??24)<2||(p.subdivisions??24)>256)throw Error('Lateral/torsion subdivisions must be between 2 and 256.');
  const locations=[0,p.length,...p.loads.map(l=>l.x),...p.restraints.map(r=>r.x),...(p.fixed??[]).map(r=>r.x)];
  if(locations.some(x=>!Number.isFinite(x)||x<0||x>p.length))throw Error('Lateral/torsion load or restraint is outside the member.');
  if(p.loads.some(l=>![l.lateral,l.torque,l.vertical??0,l.height??0].every(Number.isFinite))||p.restraints.some(r=>!Number.isFinite(r.top)||!Number.isFinite(r.bottom)||r.top<0||r.bottom<0))throw Error('Invalid lateral/torsion force or restraint stiffness.');
  for(let i=1;i<(p.subdivisions??24);i++)locations.push(p.length*i/(p.subdivisions??24));
  this.nodes=locations.sort((a,b)=>a-b).filter((x,i,all)=>i===0||x-all[i-1]>1e-6);
  const n=this.nodes.length*4;this.elastic=new BandMatrix(n);this.geometric=new BandMatrix(n);this.force=new Float64Array(n);
  const index=(x:number)=>{const i=this.nodes.findIndex(v=>Math.abs(v-x)<1e-6);if(i<0)throw Error('Missing lateral/torsion node.');return 4*i;};
  this.fixed=(p.fixed??[]).flatMap(r=>r.dofs.map(d=>index(r.x)+dofNames.indexOf(d)));
  for(let e=0;e<this.nodes.length-1;e++){
   const x0=this.nodes[e],L=this.nodes[e+1]-x0;
   const v=[4*e,4*e+1,4*e+4,4*e+5],t=v.map(i=>i+2);
   for(let g=0;g<gaussX.length;g++){
    const xi=(gaussX[g]+1)/2,w=gaussW[g]*L/2,h=hermiteInto(xi,L),x=x0+xi*L,M=p.moment?.(x)??0,N=p.axial??0;
    if(!Number.isFinite(M))throw Error('Nonfinite major-axis moment in lateral/torsion analysis.');
    for(let i=0;i<4;i++){
     this.force[v[i]]+=w*h.n[i]*(p.distributedLateral??0);
     this.force[t[i]]+=w*h.n[i]*(p.distributedTorque??0);
     for(let j=0;j<=i;j++){
      this.elastic.add(v[i],v[j],w*p.E*p.Iy*h.dd[i]*h.dd[j]);
      this.elastic.add(t[i],t[j],w*(p.E*p.Cw*h.dd[i]*h.dd[j]+p.G*p.J*h.d[i]*h.d[j]));
      this.geometric.add(v[i],v[j],-w*N*h.d[i]*h.d[j]);
      this.geometric.add(t[i],t[j],-w*((N*p.polarRadiusSquared+M*(p.monosymmetry??0))*h.d[i]*h.d[j]+(p.distributedVertical??0)*(p.distributedHeight??0)*h.n[i]*h.n[j]));
     }
     // Every v/theta pair is distinct; add its symmetric contribution once.
     for(let j=0;j<4;j++)this.geometric.add(v[i],t[j],w*(M*h.dd[i]*h.n[j]-N*(p.centroidOffset??0)*h.d[i]*h.d[j]));
    }
   }
  }
  for(const r of p.restraints){const i=index(r.x),yt=p.topOffset??p.h0/2,yb=p.bottomOffset??-p.h0/2;this.elastic.add(i,i,r.top+r.bottom);this.elastic.add(i+2,i+2,r.top*yt*yt+r.bottom*yb*yb);this.elastic.add(i+2,i,r.top*yt+r.bottom*yb);}
  for(const l of p.loads){const i=index(l.x);this.force[i]+=l.lateral;this.force[i+2]+=l.torque;this.geometric.add(i+2,i+2,-(l.vertical??0)*(l.height??0));}
 }
 private matrix(multiplier:number,constrain=true){
  const a=new BandMatrix(this.elastic.n);for(let i=0;i<a.a.length;i++)a.a[i]=this.elastic.a[i]+multiplier*this.geometric.a[i];
  if(constrain)for(const i of this.fixed){for(let j=Math.max(0,i-bw);j<=Math.min(a.n-1,i+bw);j++)a.set(i,j,0);a.set(i,i,1);}
  return a;
 }
 isStable(multiplier=1){return factor(this.matrix(multiplier))!==null;}
 /** First loss of positive definiteness under proportional geometric loading.
  * A returned upper bound means the critical multiplier is at least that bound.
  * It is an elastic eigenvalue; material/design resistance is checked separately.
  */
 criticalMultiplier(upperBound=128){
  if(!this.isStable(0))throw Error('Unrestrained or ill-conditioned lateral/torsion model.');
  if(!Number.isFinite(upperBound)||upperBound<=0)throw Error('Critical-load bound must be positive.');
  let lo=0,hi=Math.min(1,upperBound);
  while(hi<upperBound&&this.isStable(hi)){lo=hi;hi=Math.min(upperBound,hi*2);}
  if(hi===upperBound&&this.isStable(hi))return {value:hi,bounded:true};
  for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(this.isStable(mid))lo=mid;else hi=mid;}
  return {value:lo,bounded:false};
 }
 solve(geometricMultiplier=0):LateralTorsionResult {
  const matrix=this.matrix(geometricMultiplier),f=this.force.slice();for(const i of this.fixed)f[i]=0;
  const solver=factor(matrix);if(!solver)throw Error('Lateral/torsional instability at the applied load.');
  const u=solver.solve(f),p=this.input;
  // One step of iterative refinement removes round-off left by the scaled band factorization.
  {const Ku=matrix.multiply(u),r=new Float64Array(u.length);for(let i=0;i<u.length;i++)r[i]=f[i]-Ku[i];const du=solver.solve(r);for(let i=0;i<u.length;i++)u[i]+=du[i];}
  const at=(x:number,side:'left'|'right'='right'):LateralTorsionStation=>{
   if(x<0||x>p.length)throw Error('Recovery station outside lateral/torsion member.');
   let e=this.nodes.findIndex((v,i)=>i<this.nodes.length-1&&x>=v-1e-8&&(x<this.nodes[i+1]-1e-8||(side==='left'&&x<=this.nodes[i+1]+1e-8)));
   if(e<0)e=this.nodes.length-2;
   return inElement(e,x);
  };
  const inElement=(e:number,x:number):LateralTorsionStation=>{
   const h=hermite((x-this.nodes[e])/(this.nodes[e+1]-this.nodes[e]),this.nodes[e+1]-this.nodes[e]);
   const v=[u[4*e],u[4*e+1],u[4*e+4],u[4*e+5]],t=[u[4*e+2],u[4*e+3],u[4*e+6],u[4*e+7]];
   return {x,v:dot(h.n,v),slope:dot(h.d,v),twist:dot(h.n,t),twistRate:dot(h.d,t),curvature:dot(h.dd,v),warpingCurvature:dot(h.dd,t),warpingThird:dot(h.ddd,t),lateralThird:dot(h.ddd,v)};
  };
  // Element midpoints and both sides of each node, by element index: the elements at() would find.
  const stations=this.nodes.flatMap((x,i)=>i===0?[inElement(0,x)]:[inElement(i-1,(this.nodes[i-1]+x)/2),inElement(i-1,x),...(i===this.nodes.length-1?[]:[inElement(i,x)])]);
  const restraints=p.restraints.map(r=>{const s=at(r.x),yt=p.topOffset??p.h0/2,yb=p.bottomOffset??-p.h0/2,top=r.top*(s.v+yt*s.twist),bottom=r.bottom*(s.v+yb*s.twist);return {x:r.x,top,bottom,lateral:top+bottom,torque:top*yt+bottom*yb};});
  const residualVector=this.matrix(geometricMultiplier,false).multiply(u);
  let numerator=0,denominator=1;
  for(let i=0;i<u.length;i++){if(this.fixed.includes(i))continue;numerator=Math.max(numerator,Math.abs(residualVector[i]-this.force[i])/Math.sqrt(this.elastic.get(i,i)));denominator=Math.max(denominator,Math.abs(this.force[i])/Math.sqrt(this.elastic.get(i,i)));}
  const fixedReactions=this.fixed.map(i=>({x:this.nodes[Math.floor(i/4)],dof:dofNames[i%4],value:this.force[i]-residualVector[i]}));
  return {stations,restraints,fixedReactions,residual:numerator/denominator,at};
 }
}
