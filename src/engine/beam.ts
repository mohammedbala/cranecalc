/** Euler–Bernoulli finite elements. Canonical units: N, mm, MPa. */
import {meshNodes,meshTolerance} from './meshNodes';
export interface AppliedLoad {x:number;p:number;}
export interface BeamResult {x:number[]; displacement:number[]; rotation:number[]; reactions:{x:number;r:number}[]; moment:number[]; shear:number[]; equilibriumError:number;}
function stiffness(EI:number,L:number){const a=EI/L**3;return [[12,6*L,-12,6*L],[6*L,4*L*L,-6*L,2*L*L],[-12,-6*L,12,-6*L],[6*L,2*L*L,-6*L,4*L*L]].map(r=>r.map(v=>v*a));}
function cholesky(a:number[][]){const n=a.length,l=Array.from({length:n},()=>Array(n).fill(0) as number[]);for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=a[i][j];for(let k=0;k<j;k++)s-=l[i][k]*l[j][k];if(i===j){if(s<=0||!Number.isFinite(s))throw Error('Unstable or ill-conditioned support model.');l[i][j]=Math.sqrt(s);}else l[i][j]=s/l[j][j];}return l;}
function solve(l:number[][],f:number[]){const n=f.length,y=Array(n).fill(0) as number[],x=Array(n).fill(0) as number[];for(let i=0;i<n;i++){let s=f[i];for(let j=0;j<i;j++)s-=l[i][j]*y[j];y[i]=s/l[i][i];}for(let i=n-1;i>=0;i--){let s=y[i];for(let j=i+1;j<n;j++)s-=l[j][i]*x[j];x[i]=s/l[i][i];}return x;}
export class Beam {
 readonly nodes:number[]; private K:number[][]; private free:number[];private fixed:number[];private factor:number[][];
 constructor(start:number,end:number,EI:number,supports:number[],subdivisions=20){
  // No sliver elements (they ruin the stiffness conditioning): supports closer than meshTolerance share a node, the
  // first listed keeping its position (beamSystem lists the grids before the brace stations), and subdivision points
  // within it of a support are left out. Loads are not nodes: evaluate() applies them by the element shape functions.
  const tolerance=meshTolerance(end-start),inside=supports.filter(x=>x>start&&x<end);
  const mesh=meshNodes([start,end,...inside],[],Array.from({length:subdivisions},(_,i)=>start+(end-start)*i/subdivisions).slice(1),tolerance);
  this.nodes=mesh.nodes;const n=this.nodes.length*2;
  this.K=Array.from({length:n},()=>Array(n).fill(0) as number[]);
  for(let e=0;e<this.nodes.length-1;e++){const k=stiffness(EI,this.nodes[e+1]-this.nodes[e]);for(let i=0;i<4;i++)for(let j=0;j<4;j++)this.K[2*e+i][2*e+j]+=k[i][j];}
  this.fixed=[...new Set(supports.filter(x=>x>=start-tolerance&&x<=end+tolerance).map(x=>2*mesh.index(x)))].sort((a,b)=>a-b);
  this.free=Array.from({length:n},(_,i)=>i).filter(i=>!this.fixed.includes(i));
  this.factor=cholesky(this.free.map(i=>this.free.map(j=>this.K[i][j])));
 }
 evaluate(loads:AppliedLoad[],q=0):BeamResult {
  const f=Array(this.nodes.length*2).fill(0) as number[];
  for(let e=0;e<this.nodes.length-1;e++){const L=this.nodes[e+1]-this.nodes[e];const fe=[q*L/2,q*L*L/12,q*L/2,-q*L*L/12];for(let i=0;i<4;i++)f[2*e+i]+=fe[i];}
  for(const load of loads){const x=load.x;let i=this.nodes.findIndex(v=>Math.abs(x-v)<1e-7);if(i>=0){f[2*i]+=load.p;continue;}
   i=this.nodes.findIndex((v,i)=>v<x&&this.nodes[i+1]>x);if(i<0)continue;
   const L=this.nodes[i+1]-this.nodes[i],t=(x-this.nodes[i])/L;
   const N=[1-3*t*t+2*t*t*t,L*(t-2*t*t+t*t*t),3*t*t-2*t*t*t,L*(-t*t+t*t*t)];for(let j=0;j<4;j++)f[2*i+j]+=N[j]*load.p;
  }
  const u=Array(f.length).fill(0) as number[],d=solve(this.factor,this.free.map(i=>f[i]));this.free.forEach((v,i)=>u[v]=d[i]);
  const reactions=this.fixed.map(i=>({x:this.nodes[i/2],r:-(this.K[i].reduce((sum,k,j)=>sum+k*u[j],0)-f[i])}));
  const moment=this.nodes.map(x=>momentAt(x,reactions,loads,q,this.nodes[0]));
  const shear=this.nodes.map(x=>reactions.reduce((s,r)=>s+(r.x<=x+1e-6?r.r:0),0)-loads.reduce((s,p)=>s+(p.x<=x+1e-6?p.p:0),0)-q*(x-this.nodes[0]));
  const sum=loads.reduce((s,p)=>s+p.p,0)+q*(this.nodes.at(-1)!-this.nodes[0]);
  const equilibriumError=Math.abs(reactions.reduce((s,r)=>s+r.r,0)-sum)/Math.max(Math.abs(sum),1);
  return {x:this.nodes,displacement:this.nodes.map((_,i)=>u[2*i]),rotation:this.nodes.map((_,i)=>u[2*i+1]),reactions,moment,shear,equilibriumError};
 }
}
export function momentAt(x:number,reactions:{x:number;r:number}[],loads:AppliedLoad[],q:number,start=0){return reactions.reduce((s,r)=>s+(r.x<x?r.r*(x-r.x):0),0)-loads.reduce((s,p)=>s+(p.x<x?p.p*(x-p.x):0),0)-q*(x-start)**2/2;}
export function beamSystem(spans:number[],EI:number,system:'simple'|'continuous',braceSpacing?:number,subdivisions=20){
 const supports=[0];for(const span of spans)supports.push(supports.at(-1)!+span);
 // Every brace station along the runway: the loop bound is the runway end, fixed before the stations are added. The
 // grids stay listed first, so a mesh node they share with a brace station keeps the grid position; a station within
 // meshTolerance of a grid is that grid.
 if(braceSpacing){const L=supports.at(-1)!,grids=[...supports],tolerance=meshTolerance(Math.min(...spans));for(let x=braceSpacing;x<L-1e-6;x+=braceSpacing)if(grids.every(g=>Math.abs(g-x)>tolerance))supports.push(x);}
 const groups=system==='continuous'?[[0,spans.reduce((a,b)=>a+b,0)]]:spans.map((s,i)=>[spans.slice(0,i).reduce((a,b)=>a+b,0),spans.slice(0,i+1).reduce((a,b)=>a+b,0)]);
 const beams=groups.map(([a,b])=>new Beam(a,b,EI,supports.filter(x=>x>=a&&x<=b),subdivisions*Math.max(1,system==='continuous'?spans.length:1)));
 return {evaluate(loads:AppliedLoad[],q=0):BeamResult {
  const results=beams.map((beam,i)=>beam.evaluate(loads.filter(p=>p.x>=beam.nodes[0]&&(p.x<beam.nodes.at(-1)!||(i===beams.length-1&&p.x<=beam.nodes.at(-1)!))),q));
  const reactions:{x:number;r:number}[]=[];
  for(const b of results)for(const r of b.reactions){const existing=reactions.find(a=>Math.abs(a.x-r.x)<1e-6);if(existing)existing.r+=r.r;else reactions.push({...r});}
  return {x:results.flatMap(r=>r.x),moment:results.flatMap(r=>r.moment),shear:results.flatMap(r=>r.shear),displacement:results.flatMap(r=>r.displacement),rotation:results.flatMap(r=>r.rotation),reactions:reactions.sort((a,b)=>a.x-b.x),equilibriumError:Math.max(...results.map(r=>r.equilibriumError))};
 }};
}
