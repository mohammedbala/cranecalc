/**
 * Linear elastic analysis of one column in one bending plane: Euler-Bernoulli
 * elements between the base, load points and the top. The base is pinned or
 * fixed; the top is either braced against translation (eave strut, roof
 * diaphragm or bracing) or free (the column alone resists sway). Building
 * frame action, base flexibility and second-order effects are not modeled.
 * The flexural stiffness may vary along the height (a stepped column): EI(x) is
 * taken at each element's midpoint, so every change of section must be a node
 * (pass it in `stations`). columnBuckling below is the elastic buckling
 * eigenvalue of the same model. Canonical units: N, mm, N·mm.
 */
import {meshNodes,meshTolerance} from './meshNodes';
export interface ColumnBoundary {base:'pinned'|'fixed';top:'braced'|'free';}
export interface ColumnNodalLoad {x:number;force?:number;moment?:number;}
export interface ColumnResponse {
 /** Internal moment and shear just above and just below every node, bottom to top. */
 samples:{x:number;moment:number;shear:number}[];
 displacement:(x:number)=>number;
 rotation:(x:number)=>number;
 reactions:{base:number;baseMoment:number;top:number};
}

/**
 * `stations` adds unloaded nodes so that responses to different load cases share sample points. Points closer than
 * meshTolerance share a node (a load moves onto the base, the top, a station or another load): a load 0.01 mm below a
 * free top made an element so stiff that the solution lost every digit (the base moment came out with the wrong sign).
 */
export function columnResponse(height:number,EI:ColumnStiffness,boundary:ColumnBoundary,loads:ColumnNodalLoad[],stations:number[]=[]):ColumnResponse{
 if(boundary.base==='pinned'&&boundary.top==='free')throw Error('A pinned-base column with a free top is unstable.');
 if([...loads.map(l=>l.x),...stations].some(x=>!(x>=0&&x<=height)))throw Error('Column loads must lie between the base and the top.');
 const mesh=meshNodes([0,height,...stations],loads.map(l=>l.x),[],meshTolerance(height)),nodes=mesh.nodes,n=nodes.length,size=2*n;
 const node=(x:number)=>{try{return mesh.index(x);}catch{return -1;}};
 const element=(x0:number,x1:number)=>{const L=x1-x0,a=elementStiffness(EI,x0,x1)/L**3;return [[12,6*L,-12,6*L],[6*L,4*L*L,-6*L,2*L*L],[-12,-6*L,12,-6*L],[6*L,2*L*L,-6*L,4*L*L]].map(r=>r.map(v=>v*a));};
 const K=Array.from({length:size},()=>Array(size).fill(0) as number[]),F=Array(size).fill(0) as number[];
 for(let e=0;e<n-1;e++){const k=element(nodes[e],nodes[e+1]);for(let i=0;i<4;i++)for(let j=0;j<4;j++)K[2*e+i][2*e+j]+=k[i][j];}
 for(const l of loads){const i=node(l.x);F[2*i]+=l.force??0;F[2*i+1]+=l.moment??0;}
 const fixed=[0,...(boundary.base==='fixed'?[1]:[]),...(boundary.top==='braced'?[2*(n-1)]:[])];
 const free=Array.from({length:size},(_,i)=>i).filter(i=>!fixed.includes(i));
 // Gaussian elimination with partial pivoting on the free degrees of freedom.
 const A=free.map(i=>[...free.map(j=>K[i][j]),F[i]]),m=free.length;
 for(let c=0;c<m;c++){
  let pivot=c;for(let r=c+1;r<m;r++)if(Math.abs(A[r][c])>Math.abs(A[pivot][c]))pivot=r;
  if(Math.abs(A[pivot][c])<1e-12*Math.max(1,Math.abs(A[c][c])))throw Error('Column model is unstable.');
  [A[c],A[pivot]]=[A[pivot],A[c]];
  for(let r=c+1;r<m;r++){const f=A[r][c]/A[c][c];for(let k=c;k<=m;k++)A[r][k]-=f*A[c][k];}
 }
 const solution=Array(m).fill(0) as number[];
 for(let r=m-1;r>=0;r--){let s=A[r][m];for(let k=r+1;k<m;k++)s-=A[r][k]*solution[k];solution[r]=s/A[r][r];}
 const u=Array(size).fill(0) as number[];free.forEach((dof,i)=>u[dof]=solution[i]);
 const reaction=(dof:number)=>K[dof].reduce((s,k,j)=>s+k*u[j],0)-F[dof];
 const samples:ColumnResponse['samples']=[];
 for(let e=0;e<n-1;e++){
  const k=element(nodes[e],nodes[e+1]),ue=[u[2*e],u[2*e+1],u[2*e+2],u[2*e+3]];
  const f=k.map(row=>row.reduce((s,v,j)=>s+v*ue[j],0));
  samples.push({x:nodes[e],moment:-f[1],shear:f[0]},{x:nodes[e+1],moment:f[3],shear:f[0]});
 }
 return {samples,displacement:x=>{const i=node(x);if(i<0)throw Error('Displacement is reported at load points and ends only.');return u[2*i];},
  rotation:x=>{const i=node(x);if(i<0)throw Error('Rotation is reported at load points and ends only.');return u[2*i+1];},
  reactions:{base:reaction(0),baseMoment:boundary.base==='fixed'?reaction(1):0,top:boundary.top==='braced'?reaction(2*(n-1)):0}};
}
/** Flexural stiffness along the column: a constant, or EI(x) evaluated at each element's midpoint (pass every change of section as a station). */
export type ColumnStiffness=number|((x:number)=>number);
/** EI of a two-segment (stepped) column: `lower` below the step, `upper` above it. Pass `step` as a station so no element straddles it. */
export const steppedStiffness=(step:number,lower:number,upper:number)=>(x:number)=>x<step?lower:upper;
const elementStiffness=(EI:ColumnStiffness,a:number,b:number)=>typeof EI==='number'?EI:EI((a+b)/2);

/**
 * Supports of the buckling model: the column's ColumnBoundary, with the top's rotation held where it is (a fixed-fixed
 * column, or a sway column guided at the top), and lateral springs (N/mm) at nodes (an elastic brace, e.g. a tie to a
 * building column). A pinned base with a free top needs a spring to be stable.
 */
export interface BucklingBoundary extends ColumnBoundary {topRotation?:'free'|'fixed';springs?:{x:number;k:number}[];}
export interface ColumnBuckling {
 /** Critical load factor λcr: the column buckles elastically under λcr·axial(x). Infinity when no part is in compression. */
 factor:number;
 /** |λcr(n)/λcr(2n) − 1| on doubling the mesh (the factor reported is the fine mesh's). */
 convergence:number;
 /** Elements of the fine mesh. */
 elements:number;
 /**
  * Effective length of a segment with flexural stiffness EI_i and axial force P_i (compression positive, at the
  * reference load): Lc,i = π√(EI_i/(λcr·P_i)) (AISC 360-16 Appendix 7 §7.2.3 and its Commentary: K from a buckling
  * analysis). Infinity where P_i ≤ 0 or nothing buckles.
  */
  effectiveLength:(EIi:number,Pi:number)=>number;
}
/**
 * Elastic flexural buckling of one column in one plane: Euler-Bernoulli elements (cubic Hermite) with the consistent
 * geometric stiffness of the axial force at each element's midpoint, nodes at the base, the top and every station
 * (steps in section and load points: axial(x) is then constant on each element), each segment between them divided
 * into equal elements. The critical factor λcr solves det(K − λ·Kg) = 0; it is bracketed and bisected on the
 * Sturm count: with K positive definite, the number of negative pivots of the LDLᵀ factor of K − λ·Kg is the number of
 * buckling factors below λ (Sylvester's law of inertia), which never misses a root the way a determinant sign change
 * can at a double root. Shear deformation and member imperfections are not modeled; canonical units N, mm.
 */
export function columnBuckling(height:number,EI:ColumnStiffness,boundary:BucklingBoundary,axial:(x:number)=>number,stations:number[]=[],options:{elements?:number;tolerance?:number}={}):ColumnBuckling{
 const springs=boundary.springs??[];
 if(boundary.base==='pinned'&&boundary.top==='free'&&!springs.some(s=>s.k>0))throw Error('A pinned-base column with a free top is unstable.');
 if([...stations,...springs.map(s=>s.x)].some(x=>!(x>=0&&x<=height)))throw Error('Column stations must lie between the base and the top.');
 const n=Math.max(8,Math.round(options.elements??48)),tol=options.tolerance??1e-9;
 const solve=(count:number)=>{
  const ends=[...new Set([0,height,...stations,...springs.map(s=>s.x)].map(x=>Math.min(height,Math.max(0,x))))].sort((a,b)=>a-b).filter((x,i,a)=>!i||x-a[i-1]>meshTolerance(height));
  const nodes=[0];
  for(let i=1;i<ends.length;i++){const a=nodes.at(-1)!,b=ends[i],k=Math.max(4,Math.ceil(count*(b-a)/height));for(let j=1;j<=k;j++)nodes.push(j===k?b:a+(b-a)*j/k);}
  const size=2*nodes.length,fixed=new Set([0,...(boundary.base==='fixed'?[1]:[]),...(boundary.top==='braced'?[size-2]:[]),...(boundary.topRotation==='fixed'?[size-1]:[])]);
  const free=Array.from({length:size},(_,i)=>i).filter(i=>!fixed.has(i)),index=new Map(free.map((d,i)=>[d,i])),m=free.length;
  // Banded storage (half bandwidth 3): the free dofs keep the node order, so an element couples dofs at most 3 apart.
  const K=Array.from({length:m},()=>new Float64Array(4)),G=Array.from({length:m},()=>new Float64Array(4));
  const add=(A:Float64Array[],i:number,j:number,v:number)=>{const a=index.get(i),b=index.get(j);if(a===undefined||b===undefined||b<a)return;A[a][b-a]+=v;};
  let compression=false;
  for(let e=0;e<nodes.length-1;e++){
   const x0=nodes[e],x1=nodes[e+1],L=x1-x0,s=elementStiffness(EI,x0,x1)/L**3,P=axial((x0+x1)/2),g=P/(30*L);if(P>0)compression=true;
   const k=[[12,6*L,-12,6*L],[6*L,4*L*L,-6*L,2*L*L],[-12,-6*L,12,-6*L],[6*L,2*L*L,-6*L,4*L*L]],kg=[[36,3*L,-36,3*L],[3*L,4*L*L,-3*L,-L*L],[-36,-3*L,36,-3*L],[3*L,-L*L,-3*L,4*L*L]];
   for(let i=0;i<4;i++)for(let j=0;j<4;j++){add(K,2*e+i,2*e+j,s*k[i][j]);add(G,2*e+i,2*e+j,g*kg[i][j]);}
  }
  for(const sp of springs){const i=nodes.findIndex(x=>Math.abs(x-sp.x)<=meshTolerance(height));add(K,2*i,2*i,sp.k);}
  // Number of negative pivots of K − λG (LDLᵀ without pivoting on the band).
  const negatives=(lambda:number)=>{
   const A=K.map((r,i)=>r.map((v,j)=>v-lambda*G[i][j]));let neg=0;
   for(let c=0;c<m;c++){
    let d=A[c][0];if(d===0)d=-1e-300;if(d<0)neg++;
    for(let r=1;r<4&&c+r<m;r++){const f=A[c][r]/d;if(!f)continue;for(let k=r;k<4&&c+k<m;k++)A[c+r][k-r]-=f*A[c][k];}
   }
   return neg;
  };
  if(!compression)return {factor:Infinity,elements:nodes.length-1};
  if(negatives(0))throw Error('Column model is unstable.');
  // Bracket: start near the Euler load of the stiffest segment at the largest compression over the height, then double.
  const Pmax=Math.max(...nodes.slice(1).map((x,i)=>axial((nodes[i]+x)/2))),EImax=Math.max(...nodes.slice(1).map((x,i)=>elementStiffness(EI,nodes[i],x)));
  let lo=0,hi=Math.PI**2*EImax/(4*height**2)/Pmax;
  for(let i=0;negatives(hi)===0;i++){if(i>200)return {factor:Infinity,elements:nodes.length-1};lo=hi;hi*=2;}
  while(hi-lo>tol*hi){const mid=(lo+hi)/2;if(negatives(mid))hi=mid;else lo=mid;}
  return {factor:(lo+hi)/2,elements:nodes.length-1};
 };
 const coarse=solve(n),fine=solve(2*n),factor=fine.factor;
 return {factor,convergence:Number.isFinite(factor)?Math.abs(coarse.factor/factor-1):0,elements:fine.elements,
  effectiveLength:(EIi,Pi)=>Pi>0&&Number.isFinite(factor)?Math.PI*Math.sqrt(EIi/(factor*Pi)):Infinity};
}
/** Largest |a·m1(x) + b·m2(x)| with independent signs, i.e. max |a·m1| + |b·m2| at a common section. */
export function combinedPeak(a:ColumnResponse['samples'],b:ColumnResponse['samples'],key:'moment'|'shear',fa:number,fb:number){
 if(a.length!==b.length||a.some((s,i)=>Math.abs(s.x-b[i].x)>1e-9))throw Error('Column responses must share sample stations.');
 return Math.max(0,...a.map((s,i)=>Math.abs(fa*s[key])+Math.abs(fb*b[i][key])));
}
