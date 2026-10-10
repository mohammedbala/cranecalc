/**
 * Linear elastic analysis of one column in one bending plane: Euler-Bernoulli
 * elements between the base, load points and the top. The base is pinned or
 * fixed; the top is either braced against translation (eave strut, roof
 * diaphragm or bracing) or free (the column alone resists sway). Building
 * frame action, base flexibility and second-order effects are not modeled.
 * Canonical units: N, mm, N·mm.
 */
export interface ColumnBoundary {base:'pinned'|'fixed';top:'braced'|'free';}
export interface ColumnNodalLoad {x:number;force?:number;moment?:number;}
export interface ColumnResponse {
 /** Internal moment and shear just above and just below every node, bottom to top. */
 samples:{x:number;moment:number;shear:number}[];
 displacement:(x:number)=>number;
 rotation:(x:number)=>number;
 reactions:{base:number;baseMoment:number;top:number};
}

/** `stations` adds unloaded nodes so that responses to different load cases share sample points. */
export function columnResponse(height:number,EI:number,boundary:ColumnBoundary,loads:ColumnNodalLoad[],stations:number[]=[]):ColumnResponse{
 if(boundary.base==='pinned'&&boundary.top==='free')throw Error('A pinned-base column with a free top is unstable.');
 if([...loads.map(l=>l.x),...stations].some(x=>!(x>=0&&x<=height)))throw Error('Column loads must lie between the base and the top.');
 const nodes=[0,height,...loads.map(l=>l.x),...stations].sort((a,b)=>a-b).filter((x,i,s)=>!i||x-s[i-1]>1e-9),n=nodes.length,size=2*n;
 const node=(x:number)=>nodes.findIndex(v=>Math.abs(v-x)<=1e-9);
 const element=(L:number)=>{const a=EI/L**3;return [[12,6*L,-12,6*L],[6*L,4*L*L,-6*L,2*L*L],[-12,-6*L,12,-6*L],[6*L,2*L*L,-6*L,4*L*L]].map(r=>r.map(v=>v*a));};
 const K=Array.from({length:size},()=>Array(size).fill(0) as number[]),F=Array(size).fill(0) as number[];
 for(let e=0;e<n-1;e++){const k=element(nodes[e+1]-nodes[e]);for(let i=0;i<4;i++)for(let j=0;j<4;j++)K[2*e+i][2*e+j]+=k[i][j];}
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
  const k=element(nodes[e+1]-nodes[e]),ue=[u[2*e],u[2*e+1],u[2*e+2],u[2*e+3]];
  const f=k.map(row=>row.reduce((s,v,j)=>s+v*ue[j],0));
  samples.push({x:nodes[e],moment:-f[1],shear:f[0]},{x:nodes[e+1],moment:f[3],shear:f[0]});
 }
 return {samples,displacement:x=>{const i=node(x);if(i<0)throw Error('Displacement is reported at load points and ends only.');return u[2*i];},
  rotation:x=>{const i=node(x);if(i<0)throw Error('Rotation is reported at load points and ends only.');return u[2*i+1];},
  reactions:{base:reaction(0),baseMoment:boundary.base==='fixed'?reaction(1):0,top:boundary.top==='braced'?reaction(2*(n-1)):0}};
}
/** Largest |a·m1(x) + b·m2(x)| with independent signs, i.e. max |a·m1| + |b·m2| at a common section. */
export function combinedPeak(a:ColumnResponse['samples'],b:ColumnResponse['samples'],key:'moment'|'shear',fa:number,fb:number){
 if(a.length!==b.length||a.some((s,i)=>Math.abs(s.x-b[i].x)>1e-9))throw Error('Column responses must share sample stations.');
 return Math.max(0,...a.map((s,i)=>Math.abs(fa*s[key])+Math.abs(fb*b[i][key])));
}
