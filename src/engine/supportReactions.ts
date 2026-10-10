import { cranePositions, pairs } from './cranePositions';
import { beamSystem, type BeamResult } from './beam';
import { craneDesignMinimum, emptyAistInputs } from './aistLoads';
import type { ProjectInput, Properties } from './types';
import { adjacentReactions } from './continuation';

/**
 * Unfactored support reactions by load type, for checking the building that
 * carries the runway. Downward vertical reactions are positive. Crane loads
 * use the governing AIST/ASCE 7 impact and side-thrust minimums.
 *
 * Cd/Cv/Ci come from the crane arrangement (any number of present cranes,
 * respecting order and separation) that maximizes Cd+Cv+Ci at the support.
 * Css is the largest single-crane side-thrust reaction at the support from
 * any position; it is taken concurrently with the vertical maximum, which is
 * conservative. Cls is the runway's largest single-crane longitudinal force;
 * which support resists it depends on the longitudinal load path.
 */
export interface SupportReaction {
 x:number; D:number; L:number; Cd:number; Cv:number; Ci:number; Css:number;
 /** Least crane vertical reaction (negative is uplift), crane loads only. */
 craneMinimum:number;
 cranes:{index:number;origin:number}[];
}
export interface SupportReactionSet { supports:SupportReaction[]; Cls:number; }

export function supportStations(p:ProjectInput){const s=[0];for(const l of p.spans)s.push(s.at(-1)!+l);return s;}

export function supportReactions(p:ProjectInput,props:Properties,steps=40):SupportReactionSet{
 const di=p.aist??emptyAistInputs,stations=supportStations(p),L=stations.at(-1)!;
 const vertical=beamSystem(p.spans,p.section.E*props.Ix,p.system);
 // Net side thrust at the rail head is distributed by the top-flange lateral system (rigid braces).
 const lateral=beamSystem(p.spans,p.section.E*p.section.tf*p.section.bf**3/12,p.system,p.lateralBraceSpacing);
 const at=(r:BeamResult)=>stations.map(x=>r.reactions.find(v=>Math.abs(v.x-x)<1e-6)?.r??0);
 // An adjacent existing simple-span girder bearing on a modeled end support adds its own reaction there.
 const plus=(a:number[],b:number[])=>a.map((v,j)=>v+b[j]);
 const D=plus(at(vertical.evaluate([],p.deadLoad+p.railWeight+props.weight)),adjacentReactions(p,[],p.deadLoad+p.railWeight+props.weight)),Live=plus(at(vertical.evaluate([],di.liveLoad)),adjacentReactions(p,[],di.liveLoad));
 const positions=cranePositions(p,steps,stations);
 const responses=p.cranes.map((c,k)=>{
  const m=craneDesignMinimum(c),impact=Math.max(c.impact,m.impact);
  const side=c.wheels.reduce((s,w)=>s+w.lateral,0),sideFactor=side>0?Math.max(1,m.runwaySide/side):1;
  // Each wheel directly over each support gives the exact reaction maxima for point loads; neighbouring
  // cranes are also placed at closest approach.
  return positions[k].flatMap(position=>{const origin=position.origin;
   const all=c.wheels.map(w=>({x:origin+w.offset,unloaded:w.unloaded,static:w.loaded/(c.includesImpact?1+c.impact:1),lateral:w.lateral*sideFactor})),wheels=all.filter(w=>w.x>=0&&w.x<=L);
   const beyond=(key:(w:typeof all[number])=>number)=>adjacentReactions(p,all.map(w=>({x:w.x,p:key(w)})));
   if(!wheels.length&&beyond(w=>w.static).every(v=>v===0))return [];
   return [{origin,position,last:origin+c.wheels.at(-1)!.offset,
    Cd:plus(at(vertical.evaluate(wheels.map(w=>({x:w.x,p:w.unloaded})))),beyond(w=>w.unloaded)),
    Cv:plus(at(vertical.evaluate(wheels.map(w=>({x:w.x,p:w.static-w.unloaded})))),beyond(w=>w.static-w.unloaded)),
    Ci:plus(at(vertical.evaluate(wheels.map(w=>({x:w.x,p:impact*w.static})))),beyond(w=>impact*w.static)),
    // The adjacent girder's side-thrust reaction goes to the same column through its own ties.
    Css:plus(at(lateral.evaluate(wheels.map(w=>({x:w.x,p:w.lateral})))).map(Math.abs),beyond(w=>w.lateral))}];
  });
 });
 const supports:SupportReaction[]=stations.map((x,j)=>({x,D:D[j],L:Live[j],Cd:0,Cv:0,Ci:0,Css:Math.max(0,...responses.flat().map(r=>r.Css[j])),craneMinimum:0,cranes:[]}));
 const best=stations.map(()=>-Infinity);
 const chosen:{index:number;r:typeof responses[number][number]}[]=[];
 function record(){
  for(let j=0;j<stations.length;j++){
   const Cd=chosen.reduce((s,c)=>s+c.r.Cd[j],0),Cv=chosen.reduce((s,c)=>s+c.r.Cv[j],0),Ci=chosen.reduce((s,c)=>s+c.r.Ci[j],0),total=Cd+Cv+Ci;
   if(total>best[j]){best[j]=total;Object.assign(supports[j],{Cd,Cv,Ci,cranes:chosen.map(c=>({index:c.index,origin:c.r.origin}))});}
   supports[j].craneMinimum=Math.min(supports[j].craneMinimum,total);
  }
 }
 // Cranes keep their runway order; each may also be absent from the modeled runway.
 function visit(index:number){
  if(index===responses.length){record();return;}
  visit(index+1);
  for(const r of responses[index]){
   const previous=chosen.at(-1);
   if(!pairs(p,index,r.position,previous&&{index:previous.index,position:previous.r.position}))continue;
   chosen.push({index,r});visit(index+1);chosen.pop();
  }
 }
 visit(0);
 const Cls=Math.max(0,...p.cranes.map(c=>Math.max(c.longitudinal,craneDesignMinimum(c).traction)));
 return {supports,Cls};
}
