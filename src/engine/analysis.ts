import { beamSystem, momentAt, type BeamResult } from './beam';
import { adjacentReactions } from './continuation';
import type { Analysis, Crane, Demand, EnvelopePoint, LoadCase, PointLoad, ProjectInput, Properties } from './types';
const absMax=(a:number[])=>Math.max(0,...a.map(Math.abs));
export function movingAnalysis(p:ProjectInput,props:Properties,subdivisions=20):Analysis {
 const length=p.spans.reduce((a,b)=>a+b,0),q=p.deadLoad+p.railWeight+props.weight;
 const vertical=beamSystem(p.spans,p.section.E*props.Ix,p.system,undefined,subdivisions),lateral=beamSystem(p.spans,p.section.E*props.Iy,p.system,p.lateralBraceSpacing,subdivisions);
 const dead=vertical.evaluate([],q),zeroV=vertical.evaluate([]),zeroH=lateral.evaluate([]);
 const deadAdjacent=adjacentReactions(p,[],q);
 const maxEq={value:dead.equilibriumError};
 function craneResponse(c:Crane,position:number){
  const all:PointLoad[]=c.wheels.map(w=>({x:position+w.offset,vertical:w.loaded*(c.includesImpact?1:1+c.impact),lateral:w.lateral,crane:c.name})),points=all.filter(w=>w.x>=0&&w.x<=length);
  // Wheels on an adjacent existing bay load only the shared support.
  const adjacent=adjacentReactions(p,all.map(w=>({x:w.x,p:w.vertical})));
  const v=vertical.evaluate(points.map(w=>({x:w.x,p:w.vertical}))),service=vertical.evaluate(points.map(w=>({x:w.x,p:w.vertical/(c.includesImpact?1+c.impact:1+c.impact)}))),h=lateral.evaluate(points.map(w=>({x:w.x,p:w.lateral})));
  maxEq.value=Math.max(maxEq.value,v.equilibriumError,h.equilibriumError);
  return {position,points,v,service,h,adjacent};
 }
 function run(steps:number){
  const envelope:EnvelopePoint[]=zeroV.x.map(x=>({x,momentMax:-Infinity,momentMin:Infinity,lateralMax:-Infinity,lateralMin:Infinity,shearMax:-Infinity,shearMin:Infinity,deflectionMax:-Infinity,deflectionMin:Infinity,lateralDeflectionMax:-Infinity,lateralDeflectionMin:Infinity}));
  const demand:Demand={moment:0,lateralMoment:0,shear:0,reaction:0,uplift:0,deflection:0,lateralDeflection:0,stressRange:0,longitudinal:p.cranes.reduce((s,c)=>s+c.longitudinal,0),governing:{},reactions:[]};
  const responses=p.cranes.map(c=>{
   const a=c.travelStart,b=c.travelEnd;
   const positions=new Set<number>();for(let i=0;i<=steps;i++)positions.add(a+(b-a)*i/steps);
   // Include axle crossings of every physical support, not only uniform travel samples.
   let support=0;for(const span of [0,...p.spans]){support+=span;for(const wheel of c.wheels){const x=support-wheel.offset;if(x>=a&&x<=b)positions.add(x);}}
   return [...positions].sort((a,b)=>a-b).map(x=>craneResponse(c,x));
  });
  let cases=0;const selected:ReturnType<typeof craneResponse>[]=[];
  function visit(index:number){
   if(index<responses.length){for(const response of responses[index]){const prev=selected.at(-1);if(prev){const prevEnd=prev.position+Math.max(...p.cranes[index-1].wheels.map(w=>w.offset));if(response.position-prevEnd<Math.max(p.cranes[index-1].minSeparation,p.cranes[index].minSeparation)-1e-6)continue;}selected.push(response);visit(index+1);selected.pop();}return;}
   // Signs for each crane are independent; retain coincident actions in the governing case.
   for(let mask=0;mask<2**selected.length;mask++){
    if(++cases>160000)throw Error('Moving-load search exceeds the validated case budget. Reduce cranes or travel ranges.');
    const signs=selected.map((_,i)=>mask&(1<<i)?-1:1);
    const points=selected.flatMap((s,i)=>s.points.map(w=>({...w,lateral:w.lateral*signs[i]})));
    const lc:LoadCase={id:`C${cases}`,positions:selected.map(s=>s.position),points,lateralSign:signs[0]};
    const reactions=dead.reactions.map((r,i)=>({x:r.x,r:r.r+selected.reduce((a,s)=>a+s.v.reactions[i].r,0)})),support=reactions.map((r,i)=>({x:r.x,r:r.r+deadAdjacent[i]+selected.reduce((a,s)=>a+s.adjacent[i],0)}));
    const hReactions=zeroH.reactions.map((r,i)=>({x:r.x,r:selected.reduce((a,s,j)=>a+s.h.reactions[i].r*signs[j],0)}));
    function govern(key:keyof Demand,value:number){if(typeof demand[key]==='number'&&value>(demand[key] as number)){(demand[key] as number)=value;demand.governing[key]=lc;if(key==='reaction')demand.reactions=support.map(r=>r.r);}}
    for(let i=0;i<envelope.length;i++){
     const row=envelope[i],M=dead.moment[i]+selected.reduce((s,c)=>s+c.v.moment[i],0),V=dead.shear[i]+selected.reduce((s,c)=>s+c.v.shear[i],0),d=selected.reduce((s,c)=>s+c.service.displacement[i],0);
     const hi=zeroH.x.findIndex(x=>Math.abs(x-row.x)<1e-6);const H=momentAt(row.x,hReactions,points.map(w=>({x:w.x,p:w.lateral})),0);
     row.momentMax=Math.max(row.momentMax,M);row.momentMin=Math.min(row.momentMin,M);row.lateralMax=Math.max(row.lateralMax,H);row.lateralMin=Math.min(row.lateralMin,H);row.shearMax=Math.max(row.shearMax,V);row.shearMin=Math.min(row.shearMin,V);row.deflectionMax=Math.max(row.deflectionMax,d);row.deflectionMin=Math.min(row.deflectionMin,d);
     const hd=hi<0?0:selected.reduce((s,c,j)=>s+c.h.displacement[hi]*signs[j],0);row.lateralDeflectionMax=Math.max(row.lateralDeflectionMax,hd);row.lateralDeflectionMin=Math.min(row.lateralDeflectionMin,hd);
     govern('moment',Math.abs(M));govern('lateralMoment',Math.abs(H));govern('shear',Math.abs(V));govern('deflection',Math.abs(d));
    }
    // Capture shear discontinuities and moments exactly at each wheel position.
    for(const pt of points){const M=momentAt(pt.x,reactions,points.map(w=>({x:w.x,p:w.vertical})),q),H=momentAt(pt.x,hReactions,points.map(w=>({x:w.x,p:w.lateral})),0);govern('moment',Math.abs(M));govern('lateralMoment',Math.abs(H));for(const side of [-1e-5,1e-5]){const x=pt.x+side;if(x<0||x>length)continue;const V=reactions.reduce((s,r)=>s+(r.x<=x?r.r:0),0)-points.reduce((s,w)=>s+(w.x<=x?w.vertical:0),0)-q*x;govern('shear',Math.abs(V));}}
    govern('reaction',absMax(support.map(r=>r.r)));govern('uplift',Math.max(0,...support.map(r=>-r.r)));
    govern('lateralDeflection',absMax(zeroH.x.map((_,i)=>selected.reduce((s,c,j)=>s+c.h.displacement[i]*signs[j],0))));
   }
  }
  visit(0);if(!cases)throw Error('No crane positions satisfy the supplied travel ranges, ordering and separation.');
  return {envelope,demand,cases};
 }
 const steps=p.cranes.length===1?40:p.cranes.length===2?20:10;
 let coarse=run(steps),fine=run(steps*2);
 const compare=(a:Demand,b:Demand)=>Math.max(...(['moment','shear','reaction','deflection','lateralMoment','lateralDeflection'] as const).map(k=>Math.abs(a[k]-b[k])/Math.max(b[k],1)));
 let convergence=compare(coarse.demand,fine.demand);
 let travel=steps*2;
 while(convergence>0.01&&travel<steps*(p.cranes.length===1?16:4)){coarse=fine;travel*=2;fine=run(travel);convergence=compare(coarse.demand,fine.demand);}
 return {...fine,convergence,meshConvergence:0,equilibriumError:maxEq.value,deadMoment:absMax(dead.moment),selfWeight:props.weight};
}
