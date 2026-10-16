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
import {meshNodes,meshTolerance,type MeshNodes} from './meshNodes';
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
 // The same products, summed in the same order (j ascending), as out[i] += get(i,j)*x[j].
 multiply(x:Float64Array){const out=new Float64Array(this.n),a=this.a,n=this.n,w=bw+1;for(let i=0;i<n;i++){let s=0;const hi=Math.min(n-1,i+bw);for(let j=Math.max(0,i-bw);j<=i;j++)s+=a[i*w+i-j]*x[j];for(let j=i+1;j<=hi;j++)s+=a[j*w+j-i]*x[j];out[i]=s;}return out;}
}
// Lower-band entry (i,j), i >= j, is stored at i*(bw+1)+i-j. Same operation order as get/set.
/** Banded Cholesky factor of a, in the workspace when given (each factor entry is written before it is read). */
function factor(a:BandMatrix,work?:{l:Float64Array;scale:Float64Array}){
 const n=a.n,A=a.a,l=work?.l??new Float64Array(n*(bw+1)),scale=work?.scale??new Float64Array(n),W=bw+1;
 // at(i,j) = i*W+i-j: with ri = at(i,0) the entries of row i are ri-j (the same entries, in the same order).
 for(let i=0;i<n;i++){const d=A[i*W];if(!(d>0))return null;scale[i]=Math.sqrt(d);}
 for(let i=0;i<n;i++){const ri=i*W+i;for(let j=Math.max(0,i-bw);j<=i;j++){
  const rj=j*W+j;let s=A[ri-j]/(scale[i]*scale[j]);
  for(let k=Math.max(0,i-bw,j-bw);k<j;k++)s-=l[ri-k]*l[rj-k];
  if(i===j){if(!Number.isFinite(s)||s<1e-12)return null;l[ri-i]=Math.sqrt(s);}
  else l[ri-j]=s/l[rj-j];
 }}
 return {solve(f:Float64Array){
  const x=new Float64Array(n),y=new Float64Array(n);
  for(let i=0;i<n;i++){const ri=i*W+i;let s=f[i]/scale[i];for(let j=Math.max(0,i-bw);j<i;j++)s-=l[ri-j]*y[j];y[i]=s/l[i*W];}
  for(let i=n-1;i>=0;i--){let s=y[i];const hi=Math.min(n-1,i+bw);for(let j=i+1;j<=hi;j++)s-=l[j*W+j-i]*x[j];x[i]=s/l[i*W];}
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
 const L2=L**2;h.dd[0]=(-6+12*t)/L2;h.dd[1]=(-4+6*t)/L;h.dd[2]=(6-12*t)/L2;h.dd[3]=(-2+6*t)/L;
 return h;
}
/** hermiteInto() with the third derivatives, for station recovery (L**2 and L**3 each evaluated once). */
function hermiteThird(t:number,L:number){const h=hermiteInto(t,L),L2=L**2,L3=L**3;h.ddd[0]=12/L3;h.ddd[1]=6/L2;h.ddd[2]=-12/L3;h.ddd[3]=6/L2;return h;}
// Band offsets, relative to an element's first node, of its v/v, theta/theta and v/theta entries (as BandMatrix.add
// stores entry (i,j) of the lower triangle: i*(bw+1)+i-j for i >= j).
const localV=[0,1,4,5],localT=[2,3,6,7];
const bandOffset=(i:number,j:number)=>i>=j?i*(bw+1)+i-j:j*(bw+1)+j-i;
const bandVV=Array.from({length:16},(_,k)=>bandOffset(localV[k>>2],localV[k&3])),bandTT=Array.from({length:16},(_,k)=>bandOffset(localT[k>>2],localT[k&3])),bandVT=Array.from({length:16},(_,k)=>bandOffset(localV[k>>2],localT[k&3]));
const gaussX=[-.906179845938664,-.538469310105683,0,.538469310105683,.906179845938664];
const gaussW=[.236926885056189,.478628670499366,.568888888888889,.478628670499366,.236926885056189];
const dofNames=['v','slope','twist','warping'];

export class LateralTorsionBeam {
 readonly nodes:number[];
 private readonly mesh:MeshNodes;
 private readonly elastic:BandMatrix;
 private readonly geometric:BandMatrix;
 private readonly force:Float64Array;
 private readonly fixed:number[];
 constructor(readonly input:LateralTorsionInput){
  const p=input;
  for(const [k,v] of Object.entries({length:p.length,E:p.E,G:p.G,Iy:p.Iy,J:p.J,Cw:p.Cw,h0:p.h0,polarRadiusSquared:p.polarRadiusSquared}))if(!Number.isFinite(v)||v<=0)throw Error(`Invalid lateral/torsion ${k}.`);
  const subdivisions=p.subdivisions??24;
  if(!(subdivisions>=2&&subdivisions<=4096))throw Error('Lateral/torsion subdivisions must be between 2 and 4096.');
  const locations=[0,p.length,...p.loads.map(l=>l.x),...p.restraints.map(r=>r.x),...(p.fixed??[]).map(r=>r.x)];
  if(locations.some(x=>!Number.isFinite(x)||x<0||x>p.length))throw Error('Lateral/torsion load or restraint is outside the member.');
  if(p.loads.some(l=>![l.lateral,l.torque,l.vertical??0,l.height??0].every(Number.isFinite))||p.restraints.some(r=>!Number.isFinite(r.top)||!Number.isFinite(r.bottom)||r.top<0||r.bottom<0))throw Error('Invalid lateral/torsion force or restraint stiffness.');
  // No sliver elements: a wheel a fraction of a millimetre from a restraint node made an element so short that the
  // factorization of the softly restrained girder reported a false instability (meshTolerance). Supports and
  // restraints closer than the tolerance share a node, a load within it of a node moves onto that node, and
  // subdivision points within it of a load or restraint are left out.
  this.mesh=meshNodes([0,p.length,...(p.fixed??[]).map(r=>r.x),...p.restraints.map(r=>r.x)],p.loads.map(l=>l.x),Array.from({length:Math.ceil(subdivisions)-1},(_,i)=>p.length*(i+1)/subdivisions),meshTolerance(p.length,p.h0));
  this.nodes=this.mesh.nodes;
  const n=this.nodes.length*4;this.elastic=new BandMatrix(n);this.geometric=new BandMatrix(n);this.force=new Float64Array(n);
  const index=(x:number)=>4*this.mesh.index(x);
  this.fixed=[...new Set((p.fixed??[]).flatMap(r=>r.dofs.map(d=>index(r.x)+dofNames.indexOf(d))))];
  // Element assembly straight into the band storage: the same terms, added to each entry in the same order as
  // elastic.add / geometric.add (the left factors of each product are taken first, as written).
  const K=this.elastic.a,Kg=this.geometric.a,F=this.force,N=p.axial??0,qLateral=p.distributedLateral??0,qTorque=p.distributedTorque??0,beta=p.monosymmetry??0,c0=p.centroidOffset??0;
  const ECw=p.E*p.Cw,GJ=p.G*p.J,heightLoad=(p.distributedVertical??0)*(p.distributedHeight??0),Nc=N*c0;
  for(let e=0;e<this.nodes.length-1;e++){
   const x0=this.nodes[e],L=this.nodes[e+1]-x0,base=4*e*(bw+1),v0=4*e;
   for(let g=0;g<gaussX.length;g++){
    const xi=(gaussX[g]+1)/2,w=gaussW[g]*L/2,h=hermiteInto(xi,L),x=x0+xi*L,M=p.moment?.(x)??0;
    if(!Number.isFinite(M))throw Error('Nonfinite major-axis moment in lateral/torsion analysis.');
    const wEI=w*p.E*p.Iy,mwN=-w*N,mw=-w,Kt=N*p.polarRadiusSquared+M*beta,n=h.n,d=h.d,dd=h.dd;
    for(let i=0;i<4;i++){
     const vi=localV[i],ti=localT[i];
     F[v0+vi]+=w*n[i]*qLateral;
     F[v0+ti]+=w*n[i]*qTorque;
     for(let j=0;j<=i;j++){
      const vv=base+bandVV[4*i+j],tt=base+bandTT[4*i+j];
      K[vv]+=wEI*dd[i]*dd[j];
      K[tt]+=w*(ECw*dd[i]*dd[j]+GJ*d[i]*d[j]);
      Kg[vv]+=mwN*d[i]*d[j];
      Kg[tt]+=mw*(Kt*d[i]*d[j]+heightLoad*n[i]*n[j]);
     }
     // Every v/theta pair is distinct; add its symmetric contribution once.
     for(let j=0;j<4;j++)Kg[base+bandVT[4*i+j]]+=w*(M*dd[i]*n[j]-Nc*d[i]*d[j]);
    }
   }
  }
  for(const r of p.restraints){const i=index(r.x),yt=p.topOffset??p.h0/2,yb=p.bottomOffset??-p.h0/2;this.elastic.add(i,i,r.top+r.bottom);this.elastic.add(i+2,i+2,r.top*yt*yt+r.bottom*yb*yb);this.elastic.add(i+2,i,r.top*yt+r.bottom*yb);}
  for(const l of p.loads){const i=index(l.x);this.force[i]+=l.lateral;this.force[i+2]+=l.torque;this.geometric.add(i+2,i+2,-(l.vertical??0)*(l.height??0));}
 }
 // One scratch matrix and factor workspace per beam: every entry is rewritten by matrix() and by factor() before use.
 private scratch?:BandMatrix;private work?:{l:Float64Array;scale:Float64Array};private stability=new Map<number,boolean>();
 private matrix(multiplier:number,constrain=true){
  const a=this.scratch??=new BandMatrix(this.elastic.n),out=a.a,K=this.elastic.a,Kg=this.geometric.a;for(let i=0;i<out.length;i++)out[i]=K[i]+multiplier*Kg[i];
  if(constrain)for(const i of this.fixed){for(let j=Math.max(0,i-bw);j<=Math.min(a.n-1,i+bw);j++)a.set(i,j,0);a.set(i,i,1);}
  return a;
 }
 private factorAt(multiplier:number){return factor(this.matrix(multiplier),this.work??={l:new Float64Array(this.elastic.a.length),scale:new Float64Array(this.elastic.n)});}
 /** Positive definiteness at the multiplier; each multiplier is factorized once per beam. */
 isStable(multiplier=1){let v=this.stability.get(multiplier);if(v===undefined){v=this.factorAt(multiplier)!==null;this.stability.set(multiplier,v);}return v;}
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
  const f=this.force.slice();for(const i of this.fixed)f[i]=0;
  const solver=this.factorAt(geometricMultiplier),matrix=this.scratch!;if(!solver)throw Error('Lateral/torsional instability at the applied load.');
  const u=solver.solve(f),p=this.input;
  // One step of iterative refinement removes round-off left by the scaled band factorization.
  {const Ku=matrix.multiply(u),r=new Float64Array(u.length);for(let i=0;i<u.length;i++)r[i]=f[i]-Ku[i];const du=solver.solve(r);for(let i=0;i<u.length;i++)u[i]+=du[i];}
  const at=(x:number,side:'left'|'right'='right'):LateralTorsionStation=>{
   if(x<0||x>p.length)throw Error('Recovery station outside lateral/torsion member.');
   let e=this.nodes.findIndex((v,i)=>i<this.nodes.length-1&&x>=v-1e-8&&(x<this.nodes[i+1]-1e-8||(side==='left'&&x<=this.nodes[i+1]+1e-8)));
   if(e<0)e=this.nodes.length-2;
   return inElement(e,x);
  };
  // hermite() and dot() without their arrays: the same values, each sum taken from 0 in the same order.
  const inElement=(e:number,x:number):LateralTorsionStation=>{
   const h=hermiteThird((x-this.nodes[e])/(this.nodes[e+1]-this.nodes[e]),this.nodes[e+1]-this.nodes[e]),k=4*e;
   const v0=u[k],v1=u[k+1],v2=u[k+4],v3=u[k+5],t0=u[k+2],t1=u[k+3],t2=u[k+6],t3=u[k+7],n=h.n,d=h.d,dd=h.dd,ddd=h.ddd;
   return {x,v:0+n[0]*v0+n[1]*v1+n[2]*v2+n[3]*v3,slope:0+d[0]*v0+d[1]*v1+d[2]*v2+d[3]*v3,twist:0+n[0]*t0+n[1]*t1+n[2]*t2+n[3]*t3,twistRate:0+d[0]*t0+d[1]*t1+d[2]*t2+d[3]*t3,
    curvature:0+dd[0]*v0+dd[1]*v1+dd[2]*v2+dd[3]*v3,warpingCurvature:0+dd[0]*t0+dd[1]*t1+dd[2]*t2+dd[3]*t3,warpingThird:0+ddd[0]*t0+ddd[1]*t1+ddd[2]*t2+ddd[3]*t3,lateralThird:0+ddd[0]*v0+ddd[1]*v1+ddd[2]*v2+ddd[3]*v3};
  };
  // Element midpoints and both sides of each node, by element index: the elements at() would find.
  const stations=this.nodes.flatMap((x,i)=>i===0?[inElement(0,x)]:[inElement(i-1,(this.nodes[i-1]+x)/2),inElement(i-1,x),...(i===this.nodes.length-1?[]:[inElement(i,x)])]);
  // Each restraint acts at its node (it may share a node with a support or another restraint within meshTolerance).
  const restraints=p.restraints.map(r=>{const s=at(this.nodes[this.mesh.index(r.x)]),yt=p.topOffset??p.h0/2,yb=p.bottomOffset??-p.h0/2,top=r.top*(s.v+yt*s.twist),bottom=r.bottom*(s.v+yb*s.twist);return {x:r.x,top,bottom,lateral:top+bottom,torque:top*yt+bottom*yb};});
  const residualVector=this.matrix(geometricMultiplier,false).multiply(u);
  let numerator=0,denominator=1;
  for(let i=0;i<u.length;i++){if(this.fixed.includes(i))continue;numerator=Math.max(numerator,Math.abs(residualVector[i]-this.force[i])/Math.sqrt(this.elastic.get(i,i)));denominator=Math.max(denominator,Math.abs(this.force[i])/Math.sqrt(this.elastic.get(i,i)));}
  const fixedReactions=this.fixed.map(i=>({x:this.nodes[Math.floor(i/4)],dof:dofNames[i%4],value:this.force[i]-residualVector[i]}));
  return {stations,restraints,fixedReactions,residual:numerator/denominator,at};
 }
}
