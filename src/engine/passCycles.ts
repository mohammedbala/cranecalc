import {beamSystem,momentAt} from './beam';
import {craneTravel} from './craneTravel';
import type {ProjectInput} from './types';

/**
 * Rainflow count (ASTM E1049 three-point method, residual counted as half cycles) of a stress history: the ranges and
 * their counts (1 or 0.5).
 */
export function rainflow(history:number[]):{range:number;count:number}[]{
 const turning:number[]=[];
 for(const v of history){
  if(turning.length&&Math.abs(v-turning[turning.length-1])<=1e-12*Math.max(1,Math.abs(v)))continue;
  if(turning.length>=2&&(v-turning[turning.length-1])*(turning[turning.length-1]-turning[turning.length-2])>0)turning[turning.length-1]=v;
  else turning.push(v);
 }
 const out:{range:number;count:number}[]=[],stack:number[]=[];
 for(const v of turning){
  stack.push(v);
  while(stack.length>=3){
   const X=Math.abs(stack[stack.length-1]-stack[stack.length-2]),Y=Math.abs(stack[stack.length-2]-stack[stack.length-3]);
   if(X<Y)break;
   if(stack.length===3){out.push({range:Y,count:.5});stack.shift();}
   else{out.push({range:Y,count:1});const last=stack.pop()!;stack.pop();stack.pop();stack.push(last);}
  }
 }
 for(let i=1;i<stack.length;i++)out.push({range:Math.abs(stack[i]-stack[i-1]),count:.5});
 return out;
}

/**
 * Stress cycles per crane pass at each station of a CONTINUOUS girder, in cycles of the largest range of the pass
 * (Miner-equivalent, exponent 3): the major moment at the station while each crane's loaded wheel group crosses the
 * runway, rainflow counted, sum of count (range / largest range)^3, never below 1. At an interior support both adjacent
 * spans load it with the same sign, which gives about two cycles per pass; near midspan the count stays about one.
 * Simple spans return 1 (one cycle per pass; sub-cycles of individual wheels are not counted here).
 */
export function cyclesPerPass(p:ProjectInput,xs:number[]):number[]{
 if(p.system!=='continuous'||!p.cranes.length)return xs.map(()=>1);
 const L=p.spans.reduce((a,b)=>a+b,0),beam=beamSystem(p.spans,1,'continuous'),n=240;
 const positions=Array.from({length:n+1},(_,i)=>L*i/n);
 // Influence of a unit load at each position on the moment at each station.
 const influence=positions.map(u=>{const loads=[{x:u,p:1}],r=beam.evaluate(loads);return xs.map(x=>momentAt(x,r.reactions,loads,0));});
 const at=(u:number,k:number)=>{if(u<0||u>L)return 0;const t=u/L*n,i=Math.min(n-1,Math.floor(t)),f=t-i;return influence[i][k]*(1-f)+influence[i+1][k]*f;};
 return xs.map((_,k)=>Math.max(1,...p.cranes.map((c,ci)=>{
  const travel=craneTravel(p,ci),steps=400,history=Array.from({length:steps+1},(_,i)=>{const o=travel.start+(travel.end-travel.start)*i/steps;return c.wheels.reduce((sum,w)=>sum+w.loaded*at(o+w.offset,k),0);});
  // The pass starts and ends with the crane off this stretch of girder where its travel allows: close the history at zero.
  const cycles=rainflow([0,...history,0]),largest=Math.max(...history,0)-Math.min(...history,0);
  return largest>0?cycles.reduce((sum,v)=>sum+v.count*(v.range/largest)**3,0):1;
 })));
}
