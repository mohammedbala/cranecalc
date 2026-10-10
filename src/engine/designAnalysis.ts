import {cranePositions,pairs} from './cranePositions';
import { beamSystem, momentAt, type BeamResult } from './beam';
import { craneCombinations, emptyAistInputs, craneDesignMinimum } from './aistLoads';
import { interaction, type GirderStrength } from './aiscStrength';
import type { ProjectInput, Properties, DesignAnalysis, DesignCaseSummary } from './types';
import {cappedElasticProperties} from './capChannel';
import {railKeeperStations,girderSegments} from './simpleSupports';
import {adjacentReactions} from './continuation';
import {railTopAboveSteel} from './railSeat';

const abs=(xs:number[])=>Math.max(0,...xs.map(Math.abs));
export interface RunwayCaseEvent {
 kind:'strength'|'fatigue'|'service'; id:string; combination:string;
 cranes:{index:number;origin:number;loaded:boolean}[]; horizontalCrane:number; lateralSign:number;
 wheels:{x:number;p:number;h:number}[]; q:number; railTorquePerLength:number; axial:number;
 verticalReactions:{x:number;r:number}[];
 /** Reactions of adjacent existing girders at the modeled end supports, simultaneous with this case. */
 adjacentReactions?:{x:number;r:number}[];
 /** Strength cases: the longitudinal force times its height above the girder bearing (traction at the rail head, bumper above it). */
 longitudinalCouple?:number;
}
export type RunwayCaseObserver=(event:RunwayCaseEvent)=>void;
export function runwayDesignAnalysis(p:ProjectInput,props:Properties,strength:GirderStrength,steps:number,mesh:number,observe?:RunwayCaseObserver):DesignAnalysis {
 const di=p.aist??emptyAistInputs,L=p.spans.reduce((a,b)=>a+b,0),q=p.deadLoad+p.railWeight+props.weight;
 const vertical=beamSystem(p.spans,p.section.E*props.Ix,p.system,undefined,mesh);
 const cap=cappedElasticProperties(p.section),flangeI=p.section.tf*p.section.bf**3/12,topI=cap?.topI??flangeI;
 const top=beamSystem(p.spans,p.section.E*topI,p.system,p.lateralBraceSpacing,mesh);
 const bottom=beamSystem(p.spans,p.section.E*flangeI,p.system,di.bottomBraceSpacing||L,mesh);
 const railT=top.evaluate([],p.railWeight*p.railEccentricity/props.h0),railB=bottom.evaluate([],-p.railWeight*p.railEccentricity/props.h0);
 const v0=vertical.evaluate([]),t0=top.evaluate([]),b0=bottom.evaluate([]),dead=vertical.evaluate([],q),live=vertical.evaluate([],di.liveLoad);
 const stations=[0];for(const span of p.spans)stations.push(stations.at(-1)!+span);
 const criticalStations=[...stations];
 if(p.details){
  criticalStations.push(...p.details.fatigueDetails.map(f=>f.x));
  criticalStations.push(...railKeeperStations(p),...girderSegments(p).flatMap(m=>[m.start,m.end]));
 }
 const samples=[...new Set([...v0.x,...t0.x,...b0.x])].sort((a,b)=>a-b);
 const supportNodes=v0.x.flatMap((x,i)=>stations.some(s=>Math.abs(s-x)<1e-6)?[i]:[]);
 const bayOf=(x:number)=>{const i=stations.findIndex(s=>s>x+1e-6);return i<0?p.spans.length-1:Math.max(0,i-1);},verticalByBay=p.spans.map(()=>0),lateralByBay=p.spans.map(()=>0);
 const atDetail=(r:BeamResult,loads:{x:number;p:number}[])=>momentAt(p.fatigue.location,r.reactions,loads,0);
 const flangeY=(p.section.d-p.section.tf)/2;
 // Rail head and bumper above the girder bearing surface.
 const railTop=(cap?p.section.d+p.section.capTw:p.section.d)+railTopAboveSteel(p),bumperLever=railTop+(p.details?.endStop?.bumperHeight??0);
 const railLever=(cap?p.section.d+p.section.capTw+railTopAboveSteel(p)-cap.topY:railTopAboveSteel(p)+p.section.tf/2)/props.h0,verticalLever=p.railEccentricity/props.h0;
 let eq=Math.max(dead.equilibriumError,live.equilibriumError);
 const positions=cranePositions(p,steps,criticalStations);
 const responses=p.cranes.map((c,craneIndex)=>{
  const minimum=craneDesignMinimum(c),impact=Math.max(c.impact,minimum.impact),totalSide=c.wheels.reduce((sum,w)=>sum+w.lateral,0),sideFactor=totalSide>0?Math.max(1,minimum.runwaySide/totalSide):1;
  return positions[craneIndex].map(position=>{const origin=position.origin;
   const all=c.wheels.map(w=>({...w,lateral:w.lateral*sideFactor,x:origin+w.offset,static:w.loaded/(c.includesImpact?1+c.impact:1)})),wheels=all.filter(w=>w.x>=0&&w.x<=L);
   // Wheels on an adjacent existing bay load only the shared support, by load type.
   const adjacent={vd:adjacentReactions(p,all.map(w=>({x:w.x,p:w.unloaded}))),vl:adjacentReactions(p,all.map(w=>({x:w.x,p:w.static-w.unloaded}))),vi:adjacentReactions(p,all.map(w=>({x:w.x,p:w.static*impact})))},beyond=adjacent.vd.some(v=>v>0)||adjacent.vl.some(v=>v>0);
   const loads=(key:'dead'|'lift'|'impact'|'side'|'static')=>wheels.map(w=>({x:w.x,p:key==='dead'?w.unloaded:key==='lift'?w.static-w.unloaded:key==='impact'?w.static*impact:key==='side'?w.lateral:w.static}));
   const cd=loads('dead'),cv=loads('lift'),ci=loads('impact'),h=loads('side'),st=loads('static');
   const vd=vertical.evaluate(cd),vl=vertical.evaluate(cv),vi=vertical.evaluate(ci),vs=vertical.evaluate(st);
   const td=top.evaluate(cd),tl=top.evaluate(cv),ti=top.evaluate(ci),th=top.evaluate(h);
   const bd=bottom.evaluate(cd),bl=bottom.evaluate(cv),bi=bottom.evaluate(ci),bh=bottom.evaluate(h);
   for(const r of [vd,vl,vi,vs,td,tl,ti,th,bd,bl,bi,bh])eq=Math.max(eq,r.equilibriumError);
   // Reactions are an exact influence basis for moments at arbitrary wheel/detail stations.
   const basis=(r:BeamResult,ls:{x:number;p:number}[])=>samples.map(x=>momentAt(x,r.reactions,ls,0));
   return {origin,position,wheels,impact,adjacent,beyond,vd,vl,vi,vs,td,tl,ti,th,bd,bl,bi,bh,
    moments:{vd:basis(vd,cd),vl:basis(vl,cv),vi:basis(vi,ci),td:basis(td,cd),tl:basis(tl,cv),ti:basis(ti,ci),th:basis(th,h),bd:basis(bd,cd),bl:basis(bl,cv),bi:basis(bi,ci),bh:basis(bh,h)},
    fatigueV:[atDetail(vd,cd),atDetail(vl,cv)],fatigueT:[atDetail(td,cd),atDetail(tl,cv),atDetail(th,h)],fatigueB:[atDetail(bd,cd),atDetail(bl,cv),atDetail(bh,h)]};
  });
 });
 const combinations=craneCombinations(p.method,di.concurrency==='full'),records=new Map<string,DesignCaseSummary>();
 for(const c of combinations)records.set(c.id,{id:`${p.method} ${c.id}`,equation:c.equation,moment:0,lateralMoment:0,shear:0,reaction:0,axial:0,interaction:0,positions:[],location:0});
 const result:DesignAnalysis={combinations:[],cases:0,convergence:0,meshConvergence:0,equilibriumError:0,singleVertical:0,serviceRotation:0,deadRotation:abs(supportNodes.map(i=>dead.rotation[i])),singleLateral:0,endRotation:0,serviceReaction:0,fatigueMin:0,fatigueMax:0,wheelLoad:0,wheelNearEndLoad:0,torsion:0,moment:0,shear:0,reaction:0,uplift:0,axial:0,lateralMoment:0,topLateralMoment:0,bottomLateralMoment:0,interaction:0,governing:{}};
 const railTM=samples.map(x=>momentAt(x,railT.reactions,[],p.railWeight*verticalLever)),railBM=samples.map(x=>momentAt(x,railB.reactions,[],-p.railWeight*verticalLever));
 const deadAdjacent=adjacentReactions(p,[],q),liveAdjacent=adjacentReactions(p,[],di.liveLoad);
 const deadM=samples.map(x=>momentAt(x,dead.reactions,[],q)),liveM=samples.map(x=>momentAt(x,live.reactions,[],di.liveLoad));
 for(const [craneIndex,group] of responses.entries())for(const s of group){
  result.singleVertical=Math.max(result.singleVertical,abs(s.vs.displacement));
  // Largest single-crane deflection within each bay, for a limit on that bay's own span.
  for(let n=0;n<v0.x.length;n++){const bay=bayOf(v0.x[n]);verticalByBay[bay]=Math.max(verticalByBay[bay],Math.abs(s.vs.displacement[n]));}
  // Girder end rotation at the supports under one static crane: the cyclic movement imposed on end ties.
  result.serviceRotation=Math.max(result.serviceRotation??0,abs(supportNodes.map(i=>s.vs.rotation[i])));
  for(const sign of [-1,1]){
   for(let n=0;n<t0.x.length;n++){const v=Math.abs(verticalLever*(s.td.displacement[n]+s.tl.displacement[n])+(1+railLever)*s.th.displacement[n]*sign),bay=bayOf(t0.x[n]);result.singleLateral=Math.max(result.singleLateral,v);lateralByBay[bay]=Math.max(lateralByBay[bay],v);}
   observe?.({kind:'service',adjacentReactions:stations.map((x,j)=>({x,r:s.adjacent.vd[j]+s.adjacent.vl[j]})),id:`S-${craneIndex}-${s.origin}-${sign}`,combination:'Single crane · static',cranes:[{index:craneIndex,origin:s.origin,loaded:true}],horizontalCrane:craneIndex,lateralSign:sign,wheels:s.wheels.map(w=>({x:w.x,p:w.static,h:w.lateral*sign})),q:0,railTorquePerLength:0,axial:0,verticalReactions:s.vs.reactions});
  }
 }
 const chosen:{index:number;response:typeof responses[number][number]}[]=[];
 function govern(key:'moment'|'shear'|'reaction'|'uplift'|'axial'|'lateralMoment'|'topLateralMoment'|'bottomLateralMoment'|'interaction',value:number,c:DesignCaseSummary){if(value>result[key]){result[key]=value;result.governing[key]={...c,positions:[...c.positions]};}}
 function evaluate(){
  // Each subset includes independent empty/loaded crane states. Minimum lifted
  // load is zero conservatively; no invented minimum manufacturer lifted load.
  if(chosen.length){
   const serviceR=dead.reactions.map((r,j)=>r.r+deadAdjacent[j]+chosen.reduce((sum,s)=>sum+s.response.vd.reactions[j].r+s.response.vl.reactions[j].r+s.response.vi.reactions[j].r+s.response.adjacent.vd[j]+s.response.adjacent.vl[j]+s.response.adjacent.vi[j],0));
   result.serviceReaction=Math.max(result.serviceReaction,...serviceR);
  }
  for(let loadMask=0;loadMask<2**chosen.length;loadMask++){
   const full=chosen.map((_,i)=>Boolean(loadMask&(1<<i)));
   // Fatigue: Cds+Cvs+0.5Css, a single lateral crane force, no impact or factors. With the single-crane
   // basis (TR-13 / DG7) only arrangements with one crane on the runway are fatigue states.
   if(!(di.fatigueCranes==='single'&&chosen.length>1))for(let hi=0;hi<Math.max(1,chosen.length);hi++)for(const sign of [-1,1]){
    const topPoint=di.fatiguePoint.startsWith('top'),side=di.fatiguePoint.endsWith('left')?-1:1;
    let mx=0,my=0;
    chosen.forEach((s,i)=>{const v=s.response;mx+=v.fatigueV[0]+(full[i]?v.fatigueV[1]:0);const fm=topPoint?v.fatigueT:v.fatigueB;my+=(topPoint?1:-1)*verticalLever*(fm[0]+(full[i]?fm[1]:0))+(i===hi?.5*(topPoint?1+railLever:-railLever)*fm[2]*sign:0);});
    const majorS=cap?(topPoint?cap.Stop:cap.Sbottom):props.Sx;
    const lateralS=cap&&topPoint?cap.topS:flangeI/(p.section.bf/2);
    const stress=(topPoint?-1:1)*mx/majorS+side*my/lateralS;
    result.fatigueMin=Math.min(result.fatigueMin,stress);result.fatigueMax=Math.max(result.fatigueMax,stress);
    if(observe){
     const wheels=chosen.flatMap((s,i)=>s.response.wheels.map(w=>({x:w.x,p:full[i]?w.static:w.unloaded,h:i===hi?.5*w.lateral*sign:0})));
     const verticalReactions=v0.reactions.map((r,j)=>({x:r.x,r:chosen.reduce((sum,s,i)=>sum+s.response.vd.reactions[j].r+(full[i]?s.response.vl.reactions[j].r:0),0)}));
     const adjacentFatigue=v0.reactions.map((r,j)=>({x:r.x,r:chosen.reduce((sum,s,i)=>sum+s.response.adjacent.vd[j]+(full[i]?s.response.adjacent.vl[j]:0),0)}));
     observe({kind:'fatigue',adjacentReactions:adjacentFatigue,id:`F-${chosen.map(s=>`${s.index}@${s.response.origin}`).join(',')}-${loadMask}-${hi}-${sign}`,combination:'Cds + Cvs + 0.5 Css',cranes:chosen.map((s,i)=>({index:s.index,origin:s.response.origin,loaded:full[i]})),horizontalCrane:chosen[hi]?.index??-1,lateralSign:sign,wheels,q:0,railTorquePerLength:0,axial:0,verticalReactions});
    }
   }
   for(const factors of combinations){
    if(factors.single&&chosen.length!==1)continue;
    const ids=chosen.length&&(factors.h||factors.l||factors.bumper)?Array.from({length:chosen.length},(_,i)=>i):[-1];
    for(const hi of ids)for(const sign of factors.h?[-1,1]:[1]){
     if(++result.cases>800000)throw Error('AIST design search exceeds 800,000 cases. Reduce cranes or travel ranges.');
     const f=chosen.map((_,i)=>factors.minimumLift?0:full[i]?factors.cv:0);
     const traction=hi<0?0:factors.l*Math.max(p.cranes[chosen[hi].index].longitudinal,craneDesignMinimum(p.cranes[chosen[hi].index]).traction),bumper=hi<0?0:factors.bumper*(p.cranes[chosen[hi].index].design?.bumperBypassesGirder?0:p.cranes[chosen[hi].index].design?.bumperForce??0);
     // Traction acts at the top of the rail and the bumper above it; both are resisted at the girder bearing,
     // so each bay carries the end couple F*e as equal and opposite end reactions F*e/L.
     const axial=traction+bumper,longitudinalCouple=traction*railTop+bumper*bumperLever;
     const record=records.get(factors.id)!;
     const c:DesignCaseSummary={id:record.id,equation:record.equation,moment:0,lateralMoment:0,shear:0,reaction:0,interaction:0,positions:chosen.map(s=>s.response.origin),axial,location:0};
     const wheels=chosen.flatMap((s,i)=>s.response.wheels.map(w=>({x:w.x,p:factors.cd*w.unloaded+f[i]*(w.static-w.unloaded)+factors.i*w.static*s.response.impact,h:i===hi?factors.h*w.lateral*sign:0})));
     const vr=dead.reactions.map((r,j)=>({x:r.x,r:factors.d*r.r+factors.live*live.reactions[j].r+chosen.reduce((sum,s,i)=>sum+factors.cd*s.response.vd.reactions[j].r+f[i]*s.response.vl.reactions[j].r+factors.i*s.response.vi.reactions[j].r,0)}));
     const ar=dead.reactions.map((r,j)=>({x:r.x,r:factors.d*deadAdjacent[j]+factors.live*liveAdjacent[j]+chosen.reduce((sum,s,i)=>sum+factors.cd*s.response.adjacent.vd[j]+f[i]*s.response.adjacent.vl[j]+factors.i*s.response.adjacent.vi[j],0)}));
     const tr=t0.reactions.map((r,j)=>({x:r.x,r:factors.d*railT.reactions[j].r+chosen.reduce((sum,s,i)=>sum+verticalLever*(factors.cd*s.response.td.reactions[j].r+f[i]*s.response.tl.reactions[j].r+factors.i*s.response.ti.reactions[j].r)+(i===hi?(1+railLever)*factors.h*s.response.th.reactions[j].r*sign:0),0)}));
     const br=b0.reactions.map((r,j)=>({x:r.x,r:factors.d*railB.reactions[j].r+chosen.reduce((sum,s,i)=>sum-verticalLever*(factors.cd*s.response.bd.reactions[j].r+f[i]*s.response.bl.reactions[j].r+factors.i*s.response.bi.reactions[j].r)+(i===hi?-railLever*factors.h*s.response.bh.reactions[j].r*sign:0),0)}));
     observe?.({kind:'strength',adjacentReactions:ar,longitudinalCouple,id:`D-${result.cases}`,combination:record.id,cranes:chosen.map((s,i)=>({index:s.index,origin:s.response.origin,loaded:full[i]})),horizontalCrane:chosen[hi]?.index??-1,lateralSign:sign,wheels,q:factors.d*q+factors.live*di.liveLoad,railTorquePerLength:factors.d*p.railWeight*p.railEccentricity,axial,verticalReactions:vr});
     for(let j=0;j<dead.rotation.length;j++)result.endRotation=Math.max(result.endRotation,Math.abs(factors.d*dead.rotation[j]+factors.live*live.rotation[j]+chosen.reduce((sum,s,i)=>sum+factors.cd*s.response.vd.rotation[j]+f[i]*s.response.vl.rotation[j]+factors.i*s.response.vi.rotation[j],0)));
     const vLoads=wheels.map(w=>({x:w.x,p:w.p})),tLoads=wheels.map(w=>({x:w.x,p:verticalLever*w.p+(1+railLever)*w.h})),bLoads=wheels.map(w=>({x:w.x,p:-verticalLever*w.p-railLever*w.h}));
     for(let n=0;n<samples.length+wheels.length;n++){
      const wheel=n>=samples.length,x=wheel?wheels[n-samples.length].x:samples[n];
      let M:number,Mt:number,Mb:number;
      if(wheel){M=momentAt(x,vr,vLoads,factors.d*q+factors.live*di.liveLoad);Mt=momentAt(x,tr,tLoads,factors.d*p.railWeight*verticalLever);Mb=momentAt(x,br,bLoads,-factors.d*p.railWeight*verticalLever);}
      else{M=factors.d*deadM[n]+factors.live*liveM[n];Mt=factors.d*railTM[n];Mb=factors.d*railBM[n];chosen.forEach((s,i)=>{const m=s.response.moments;M+=factors.cd*m.vd[n]+f[i]*m.vl[n]+factors.i*m.vi[n];Mt+=verticalLever*(factors.cd*m.td[n]+f[i]*m.tl[n]+factors.i*m.ti[n])+(i===hi?(1+railLever)*factors.h*m.th[n]*sign:0);Mb-=verticalLever*(factors.cd*m.bd[n]+f[i]*m.bl[n]+factors.i*m.bi[n])+(i===hi?railLever*factors.h*m.bh[n]*sign:0);});}
      const My=Math.max(Math.abs(Mt),Math.abs(Mb)),u=Math.max(interaction(axial,M,Mt,{...strength,flangeMinor:strength.topMinor??strength.flangeMinor},p.method).utilization,interaction(axial,M,Mb,{...strength,flangeMinor:strength.bottomMinor??strength.flangeMinor},p.method).utilization);
      c.moment=Math.max(c.moment,Math.abs(M));c.lateralMoment=Math.max(c.lateralMoment,My);
      if(u>c.interaction){c.interaction=u;c.location=x;}
      // This interaction is evaluated at each actual concurrent station.
      govern('interaction',u,{...c,location:x,moment:M,lateralMoment:My});
      govern('moment',Math.abs(M),{...c,location:x,moment:M,lateralMoment:My});govern('lateralMoment',My,{...c,location:x,moment:M,lateralMoment:My});
      govern('topLateralMoment',Math.abs(Mt),{...c,location:x});govern('bottomLateralMoment',Math.abs(Mb),{...c,location:x});
      if(wheel)for(const side of [-1e-5,1e-5]){const station=x+side;if(station<0||station>L)continue;const V=vr.reduce((sum,r)=>sum+(r.x<=station?r.r:0),0)-wheels.reduce((sum,w)=>sum+(w.x<=station?w.p:0),0)-(factors.d*q+factors.live*di.liveLoad)*station;c.shear=Math.max(c.shear,Math.abs(V));}
     }
     // Include UDL end shear, also for the no-crane state.
     for(const x of stations)for(const side of [-1e-5,1e-5]){const station=x+side;if(station<0||station>L)continue;const V=vr.reduce((sum,r)=>sum+(r.x<=station?r.r:0),0)-wheels.reduce((sum,w)=>sum+(w.x<=station?w.p:0),0)-(factors.d*q+factors.live*di.liveLoad)*station;c.shear=Math.max(c.shear,Math.abs(V));}
     // Support reactions include an adjacent existing girder bearing on a modeled end support.
     // The couple can load either end of the bay that carries the force: bound both signs at every support.
     const sr=vr.map((r,j)=>r.r+ar[j].r),shift=stations.map((_,j)=>longitudinalCouple/Math.min(...[p.spans[j-1],p.spans[j]].filter(v=>v>0)));c.reaction=Math.max(0,...sr.map((r,j)=>r+shift[j]));
     govern('shear',c.shear,c);govern('reaction',c.reaction,c);govern('uplift',Math.max(0,...sr.map((r,j)=>-(r-shift[j]))),c);govern('axial',axial,c);
     for(const w of wheels){result.wheelLoad=Math.max(result.wheelLoad,w.p);if(p.system==='simple'?stations.some(x=>Math.abs(w.x-x)<=p.section.d):Math.min(w.x,L-w.x)<=p.section.d)result.wheelNearEndLoad=Math.max(result.wheelNearEndLoad,w.p);result.torsion=Math.max(result.torsion,Math.abs(w.p*p.railEccentricity+w.h*(railTopAboveSteel(p)+flangeY)));}
     record.moment=Math.max(record.moment,c.moment);record.lateralMoment=Math.max(record.lateralMoment,c.lateralMoment);record.shear=Math.max(record.shear,c.shear);record.reaction=Math.max(record.reaction,c.reaction);record.axial=Math.max(record.axial,axial);if(c.interaction>=record.interaction){record.interaction=c.interaction;record.positions=c.positions;record.location=c.location;}
    }
   }
  }
 }
 function visit(index:number){
  if(index===responses.length){evaluate();return;}
  visit(index+1); // A crane absent from the modeled runway is a real load state.
  for(const r of responses[index]){
   const previous=chosen.at(-1);if(!pairs(p,index,r.position,previous&&{index:previous.index,position:previous.response.position}))continue;
   if(!r.wheels.length&&!r.beyond)continue;chosen.push({index,response:r});visit(index+1);chosen.pop();
  }
 }
 visit(0);result.combinations=[...records.values()];result.equilibriumError=eq;result.verticalByBay=verticalByBay;result.lateralByBay=lateralByBay;return result;
}
